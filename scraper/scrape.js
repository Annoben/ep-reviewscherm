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
async function readJsonLdRating(page) {
  const blocks = await page.$$eval('script[type="application/ld+json"]', (els) =>
    els.map((e) => e.textContent || "")
  );
  for (const raw of blocks) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    // JSON-LD kan een object of een array (of @graph) zijn
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
      const ar = c.aggregateRating || c.AggregateRating;
      if (ar && (ar.ratingValue != null)) {
        return {
          value: ar.ratingValue,
          count: ar.reviewCount != null ? ar.reviewCount : ar.ratingCount,
        };
      }
    }
  }
  return null;
}

// ---------- Per bron: haal score + aantal ----------
// Elke functie probeert eerst JSON-LD (stabiel), daarna zichtbare tekst (fallback).

async function scrapeZoover(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  // 1) JSON-LD
  const ld = await readJsonLdRating(page);
  if (ld && ld.value != null) {
    return { score: commaScore(ld.value), count: ld.count != null ? String(ld.count) : null };
  }
  // 2) zichtbare tekst: "8,0 ... Score uit 36 reviews"
  const text = (await page.textContent("body")) || "";
  const flat = text.replace(/\s+/g, " ");
  const cm = flat.match(/Score uit\s*([\d.\u00a0]+)\s*reviews/i);
  const count = cm ? cm[1].replace(/[.\u00a0]/g, "") : null;
  let score = null;
  const sc = flat.match(
    /(\d{1,2}(?:[.,]\d)?)\s*(?:Fenomenaal|Fantastisch|Uitstekend|Zeer goed|Goed|Prima|Voldoende|Onvoldoende)?\s*Score uit/i
  );
  if (sc) score = commaScore(sc[1]);
  return { score, count };
}

async function scrapeBooking(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  const ld = await readJsonLdRating(page);
  if (ld && ld.value != null) {
    return { score: commaScore(ld.value), count: ld.count != null ? String(ld.count) : null };
  }
  // fallback: Booking's zichtbare score-widget
  const text = (await page.textContent("body")) || "";
  const flat = text.replace(/\s+/g, " ");
  let score = null;
  const sc =
    flat.match(/Scored\s*(\d{1,2}[.,]\d)/i) ||
    flat.match(/(\d{1,2}[.,]\d)\s*(?:Wonderful|Superb|Very good|Fabulous|Good|Fantastisch|Zeer goed|Erg goed|Goed)/i);
  if (sc) score = commaScore(sc[1]);
  const cm = flat.match(/([\d.\u00a0]{2,})\s*(?:reviews|beoordelingen)/i);
  const count = cm ? cm[1].replace(/[.\u00a0]/g, "") : null;
  return { score, count };
}

async function scrapeSpecial(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  const ld = await readJsonLdRating(page);
  if (ld && ld.value != null) {
    return { score: commaScore(ld.value), count: ld.count != null ? String(ld.count) : null };
  }
  // fallback: "gemiddelde reizigersbeoordeling voor dit park is 8.2/10"
  const text = (await page.textContent("body")) || "";
  const flat = text.replace(/\s+/g, " ");
  let score = null;
  const sc =
    flat.match(/reizigersbeoordeling[^0-9]*(\d{1,2}[.,]?\d?)\s*\/\s*10/i) ||
    flat.match(/(\d{1,2}[.,]\d)\s*\/\s*10/);
  if (sc) score = commaScore(sc[1]);
  return { score, count: null };
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
