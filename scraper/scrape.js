/**
 * EuroParcs Reviewscherm — scraper (draait op GitHub Actions, niet op Render)
 * --------------------------------------------------------------------------
 * Gebruikt een ECHTE browser (Playwright/Chromium) om de reviewscores op te
 * halen bij Booking, Zoover en BungalowSpecials. Een echte browser omzeilt de
 * anti-bot-blokkades die een gewone server-fetch tegenhouden.
 *
 * De uitkomst wordt weggeschreven naar  public/scores.json .
 * De Render-server leest dat bestand + haalt Google live op via de API.
 *
 * Parken + URL's staan in  scraper/parks.json  (die pas je aan als een URL
 * verandert). Google zit hier NIET in — dat doet de Render-server zelf.
 *
 * Lokaal draaien:  cd scraper && npm install && npx playwright install chromium && node scrape.js
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const PARKS = JSON.parse(fs.readFileSync(path.join(__dirname, "parks.json"), "utf8"));
const OUT = path.join(__dirname, "..", "public", "scores.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// ---------- Hulp: getal netjes met komma ----------
function commaScore(n) {
  if (n == null) return null;
  let s = String(n).replace(",", ".");
  const f = parseFloat(s);
  if (isNaN(f)) return null;
  // 1 decimaal, met komma
  return f.toFixed(1).replace(".", ",");
}

// ---------- Zoek aggregateRating in JSON-LD van de pagina ----------
// Dit is de STABIELE bron: schema.org-data die ook zoekmachines lezen.
// Nederlandse datumnotatie: "2026-07-03" -> "3 juli 2026"
const NL_MONTHS = ["januari","februari","maart","april","mei","juni","juli",
  "augustus","september","oktober","november","december"];
function formatDateNL(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.getUTCDate() + " " + NL_MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
}

// Leest zowel de aggregateRating als de nieuwste losse review uit de JSON-LD.
async function readJsonLd(page) {
  const blocks = await page.$$eval('script[type="application/ld+json"]', (els) =>
    els.map((e) => e.textContent || "")
  );
  let rating = null;
  let review = null; // { text, date }
  for (const raw of blocks) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const candidates = [];
    const pushAll = (x) => {
      if (!x) return;
      if (Array.isArray(x)) x.forEach(pushAll);
      else {
        candidates.push(x);
        if (x["@graph"]) pushAll(x["@graph"]);
      }
    };
    pushAll(data);
    for (const c of candidates) {
      // Rating
      if (!rating) {
        const ar = c.aggregateRating || c.AggregateRating;
        if (ar && ar.ratingValue != null) {
          rating = { value: ar.ratingValue, count: ar.reviewCount != null ? ar.reviewCount : ar.ratingCount };
        }
      }
      // Losse reviews: kan c.review zijn (object of array)
      const revs = c.review || c.reviews;
      if (revs) {
        const arr = Array.isArray(revs) ? revs : [revs];
        // pak de nieuwste met een tekst
        const withDate = arr
          .map((r) => ({
            text: (r.reviewBody || r.description || "").trim(),
            date: r.datePublished || r.dateCreated || null,
          }))
          .filter((r) => r.text || r.date);
        if (withDate.length && !review) {
          // sorteer op datum aflopend indien mogelijk
          withDate.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          review = withDate[0];
        }
      }
    }
  }
  return { rating, review };
}

// terugval-helper: alleen rating (compat met bestaande aanroepen)
async function readJsonLdRating(page) {
  const { rating } = await readJsonLd(page);
  return rating;
}

// ---------- Per bron: score + aantal + nieuwste review ----------
// Elke functie probeert eerst JSON-LD (stabiel), daarna zichtbare tekst (fallback).
// Retourneert: { score, count, reviewText, reviewDate }

function trimReview(t) {
  if (!t) return null;
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > 200 ? t.slice(0, 197).trimEnd() + "…" : t;
}

async function scrapeZoover(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  const { rating, review } = await readJsonLd(page);
  let score = null, count = null;
  if (rating && rating.value != null) {
    score = commaScore(rating.value);
    count = rating.count != null ? String(rating.count) : null;
  } else {
    const flat = ((await page.textContent("body")) || "").replace(/\s+/g, " ");
    const cm = flat.match(/Score uit\s*([\d.\u00a0]+)\s*reviews/i);
    count = cm ? cm[1].replace(/[.\u00a0]/g, "") : null;
    const sc = flat.match(/(\d{1,2}(?:[.,]\d)?)\s*(?:Fenomenaal|Fantastisch|Uitstekend|Zeer goed|Goed|Prima|Voldoende|Onvoldoende)?\s*Score uit/i);
    if (sc) score = commaScore(sc[1]);
  }
  return { score, count, reviewText: trimReview(review && review.text), reviewDate: formatDateNL(review && review.date) };
}

async function scrapeBooking(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  const { rating, review } = await readJsonLd(page);
  let score = null, count = null;
  if (rating && rating.value != null) {
    score = commaScore(rating.value);
    count = rating.count != null ? String(rating.count) : null;
  } else {
    const flat = ((await page.textContent("body")) || "").replace(/\s+/g, " ");
    const sc =
      flat.match(/Scored\s*(\d{1,2}[.,]\d)/i) ||
      flat.match(/(\d{1,2}[.,]\d)\s*(?:Wonderful|Superb|Very good|Fabulous|Good|Fantastisch|Zeer goed|Erg goed|Goed)/i);
    if (sc) score = commaScore(sc[1]);
    const cm = flat.match(/([\d.\u00a0]{2,})\s*(?:reviews|beoordelingen)/i);
    count = cm ? cm[1].replace(/[.\u00a0]/g, "") : null;
  }
  return { score, count, reviewText: trimReview(review && review.text), reviewDate: formatDateNL(review && review.date) };
}

async function scrapeSpecial(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  const { rating, review } = await readJsonLd(page);
  let score = null, count = null;
  if (rating && rating.value != null) {
    score = commaScore(rating.value);
    count = rating.count != null ? String(rating.count) : null;
  } else {
    const flat = ((await page.textContent("body")) || "").replace(/\s+/g, " ");
    const sc =
      flat.match(/reizigersbeoordeling[^0-9]*(\d{1,2}[.,]?\d?)\s*\/\s*10/i) ||
      flat.match(/(\d{1,2}[.,]\d)\s*\/\s*10/);
    if (sc) score = commaScore(sc[1]);
  }
  return { score, count, reviewText: trimReview(review && review.text), reviewDate: formatDateNL(review && review.date) };
}

const SCRAPERS = { zoover: scrapeZoover, booking: scrapeBooking, special: scrapeSpecial };

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({
    userAgent: UA,
    locale: "nl-NL",
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();

  const result = { updated: new Date().toISOString(), parks: {} };

  for (const [key, park] of Object.entries(PARKS)) {
    result.parks[key] = {};
    for (const source of ["booking", "zoover", "special"]) {
      const url = park.urls && park.urls[source];
      if (!url) continue;
      try {
        const data = await SCRAPERS[source](page, url);
        result.parks[key][source] = data;
        console.log(`[ok]   ${key}/${source}`, JSON.stringify(data));
      } catch (e) {
        result.parks[key][source] = { score: null, count: null, error: String(e.message).slice(0, 120) };
        console.warn(`[fail] ${key}/${source}: ${e.message}`);
      }
    }
  }

  await browser.close();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`\nGeschreven naar ${OUT}`);
}

main().catch((e) => {
  console.error("Scraper faalde:", e);
  process.exit(1);
});
