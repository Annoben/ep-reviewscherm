/**
 * EuroParcs Reviewscherm (zelfdraaiende server) — meerdere parken
 * ---------------------------------------------------------------
 * Eén Node-server die:
 *   1. elk uur automatisch de reviewscores (Booking, Zoover, BungalowSpecials)
 *      en de Google-rating (via Places API) ophaalt, voor ELK park;
 *   2. het tv-dashboard serveert op /  en de data op /api/data.
 *
 * Parken staan hieronder in PARKS. Wil je een park toevoegen: kopieer een blok,
 * pas de URL's en het Google-place_id aan.
 *
 * Start:  npm install  &&  npm start
 */

const express = require("express");
const path = require("path");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;
const REFRESH_MS = 60 * 60 * 1000; // 1 uur

// ====================================================================
//  PARKEN — configuratie + laatst bekende stand (fallback, 8 juli 2026)
// ====================================================================
const PARKS = {
  maasduinen: {
    name: "Maasduinen",
    // Officieel logo (van de EuroParcs-site). Valt in de front-end terug op wordmerk.
    logo: "https://cdn-cms.bookingexperts.com/uploads/theming/logo/image/21/71/Maasduinen%282%29.svg",
    urls: {
      booking: "https://www.booking.com/hotel/nl/droompark-maasduinen-belfeld4.nl.html",
      zoover:  "https://www.zoover.nl/nederland/limburg/belfeld/europarcs-maasduinen/vakantiepark",
      special: "https://www.bungalowspecials.nl/bungalows/europarcs_maasduinen.html"
    },
    googlePlaceIdEnv: "GOOGLE_PLACE_ID_MAASDUINEN",
    sites: {
      booking: { name: "Booking.com", score: "8,3", max: "10", pct: 83, count: "522 beoordelingen",
        verdict: "Zeer goed",
        quote: "Een recente gast omschrijft een fijn verblijf met een sterke ligging en een leuk park; de trampoline bij de ingang wordt door kinderen erg gewaardeerd.",
        author: "Geverifieerde gast", when: "Recent" },
      zoover: { name: "Zoover", score: "8,6", max: "10", pct: 86, count: "183 beoordelingen",
        verdict: "Fantastisch",
        quote: "\u201CNetjes, rustig en schoon park, zeker aan te raden.\u201D Gast reisde met jonge kinderen en verbleef in een huisje aan de vijver met uitzicht op de fontein.",
        author: "E. Kriege", when: "7 juli 2026" },
      google: { name: "Google", score: "4,2", max: "5", pct: 84, count: "1.114 beoordelingen",
        verdict: "Goed",
        quote: "Een terugkerende gast noemt het park voor de derde keer geweldig: goed uitgeruste huisjes middenin de natuur en een fijne uitvalsbasis om de omgeving te verkennen.",
        author: "Google-review", when: "Recent" },
      special: { name: "BungalowSpecials", score: "7,9", max: "10", pct: 79, count: "133 beoordelingen",
        verdict: "Prima",
        quote: "\u201CWundersch\u00F6ne Lage in einem reizvollen Naturgebiet.\u201D Gast prees vooral de rust en de historische dorpjes langs de Maas, ideaal om te wandelen en te fietsen.",
        author: "Bode", when: "30 juni 2026" }
    }
  },

  poortvanmaastricht: {
    name: "Poort van Maastricht",
    logo: "https://cdn-cms.bookingexperts.com/uploads/theming/logo/image/21/95/Poort_van_Maastricht%282%29.svg",
    urls: {
      booking: "https://www.booking.com/hotel/nl/europarcs-poort-van-maastricht.html",
      zoover:  "https://www.zoover.nl/a/102551/europarcs-poort-van-maastricht",
      special: "https://www.bungalowspecials.nl/bungalows/europarcs_poort_van_maastricht.html"
    },
    googlePlaceIdEnv: "GOOGLE_PLACE_ID_POORTVANMAASTRICHT",
    sites: {
      booking: { name: "Booking.com", score: "8,3", max: "10", pct: 83, count: "355 beoordelingen",
        verdict: "Zeer goed",
        quote: "\u201CClean, neat and modern interior, nice furniture and art; big swimming pool, quite close to Maastricht.\u201D Gast prees de snelle, effici\u00EBnte verwarming.",
        author: "Geverifieerde gast", when: "Recent" },
      zoover: { name: "Zoover", score: "8,3", max: "10", pct: 83, count: "reviews",
        verdict: "Zeer goed",
        quote: "Gasten waarderen de gezellige ligging tussen Maastricht en Valkenburg; het park voelt handig en knus, en de chalets zien er stralend schoon uit.",
        author: "Zoover-review", when: "Recent" },
      google: { name: "Google", score: "4,1", max: "5", pct: 82, count: "beoordelingen",
        verdict: "Goed",
        quote: "Mooie, moderne huisjes met vriendelijk personeel bij de receptie; ideale uitvalsbasis om Maastricht en Valkenburg te verkennen.",
        author: "Google-review", when: "Recent" },
      special: { name: "BungalowSpecials", score: "8,3", max: "10", pct: 83, count: "beoordelingen",
        verdict: "Zeer goed",
        quote: "Rustig en gezinsvriendelijk park in het Limburgse heuvellandschap; de bourgondische gezelligheid van Maastricht ligt om de hoek.",
        author: "BungalowSpecials", when: "Recent" }
    }
  }
};

let lastUpdated = null;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

async function getHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "nl-NL,nl;q=0.9" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return cheerio.load(await res.text());
}

function numComma(text) {
  const m = String(text).match(/(\d+[.,]\d+)/) || String(text).match(/\b(\d{1,2})\b/);
  return m ? m[1].replace(".", ",") : null;
}

// ---------- Booking.com ----------
async function fetchBooking(url) {
  const $ = await getHtml(url);
  const scoreEl = $('[data-testid="review-score-component"]').first().text()
               || $('[class*="review-score"]').first().text();
  const score = numComma(scoreEl);
  let count = null;
  const c = $('*:contains("beoordelingen")').filter((i, el) => /\d/.test($(el).text())).first().text();
  const cm = c && c.match(/([\d.\u00a0]{2,})\s*beoordelingen/);
  if (cm) count = cm[1].trim() + " beoordelingen";
  return { score, count };
}

// ---------- Zoover ----------
async function fetchZoover(url) {
  const $ = await getHtml(url);
  const el = $('[class*="rating"],[class*="score"]').first().text();
  return { score: numComma(el) };
}

// ---------- BungalowSpecials ----------
async function fetchSpecial(url) {
  const $ = await getHtml(url);
  let score = null;
  $('*').each((i, el) => {
    const t = $(el).text();
    if (!score && /\d+[.,]\d+\s*\/\s*10/.test(t)) score = numComma(t);
  });
  return { score };
}

// ---------- Google (Places API) ----------
async function fetchGoogle(placeId) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key || !placeId) return {};
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total,reviews&language=nl&key=${key}`;
  const r = await (await fetch(url)).json();
  const res = r.result || {};
  const out = {};
  if (res.rating != null) out.score = String(res.rating).replace(".", ",");
  if (res.user_ratings_total != null)
    out.count = res.user_ratings_total.toLocaleString("nl-NL") + " beoordelingen";
  if (Array.isArray(res.reviews) && res.reviews.length) {
    const rev = res.reviews[0];
    out.quote = rev.text ? rev.text.slice(0, 260) : undefined;
    out.author = rev.author_name;
    out.when = rev.relative_time_description;
  }
  return out;
}

// ---------- Eén park verversen ----------
async function refreshPark(parkKey) {
  const park = PARKS[parkKey];
  const placeId = process.env[park.googlePlaceIdEnv];
  const jobs = [
    ["booking", () => fetchBooking(park.urls.booking)],
    ["zoover",  () => fetchZoover(park.urls.zoover)],
    ["special", () => fetchSpecial(park.urls.special)],
    ["google",  () => fetchGoogle(placeId)]
  ];
  for (const [key, fn] of jobs) {
    try {
      const d = await fn();
      const s = park.sites[key];
      for (const [f, v] of Object.entries(d)) {
        if (v == null || v === "") continue;
        s[f] = v;
        if (f === "score") {
          const num = parseFloat(String(v).replace(",", "."));
          s.pct = Math.round((num / parseFloat(s.max)) * 100);
        }
      }
      console.log(`[ok]   ${parkKey}/${key}`, d);
    } catch (e) {
      console.warn(`[skip] ${parkKey}/${key}: ${e.message}`);
    }
  }
}

// ---------- Alles verversen ----------
async function refresh() {
  for (const parkKey of Object.keys(PARKS)) {
    await refreshPark(parkKey);
  }
  lastUpdated = new Date().toISOString();
}

// ---------- API-payload opbouwen ----------
function buildPayload() {
  const parks = {};
  for (const [key, park] of Object.entries(PARKS)) {
    parks[key] = { name: park.name, logo: park.logo, sites: park.sites };
  }
  return { updated: lastUpdated, parks };
}

// ---------- Routes ----------
app.use(express.static(path.join(__dirname, "public")));
app.get("/api/data", (_req, res) => res.json(buildPayload()));
app.get("/healthz", (_req, res) => res.send("ok"));

app.listen(PORT, () => {
  console.log(`EuroParcs reviewscherm draait op poort ${PORT}`);
  refresh();
  setInterval(refresh, REFRESH_MS);
});
