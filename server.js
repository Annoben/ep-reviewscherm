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
const fs = require("fs");

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
      zoover:  "https://www.zoover.nl/a/102231/europarcs-maasduinen",
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
        author: "Zoover-review", when: "Recent" },
      google: { name: "Google", score: "4,2", max: "5", pct: 84, count: "1.114 beoordelingen",
        verdict: "Goed",
        quote: "Een terugkerende gast noemt het park voor de derde keer geweldig: goed uitgeruste huisjes middenin de natuur en een fijne uitvalsbasis om de omgeving te verkennen.",
        author: "Google-review", when: "Recent" },
      special: { name: "BungalowSpecials", score: "7,9", max: "10", pct: 79, count: "",
        verdict: "Prima",
        quote: "\u201CWundersch\u00F6ne Lage in einem reizvollen Naturgebiet.\u201D Gast prees vooral de rust en de historische dorpjes langs de Maas, ideaal om te wandelen en te fietsen.",
        author: "BungalowSpecials", when: "Recent" }
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
      zoover: { name: "Zoover", score: "8,0", max: "10", pct: 80, count: "36 beoordelingen",
        verdict: "Zeer goed",
        quote: "Gasten waarderen de gezellige ligging tussen Maastricht en Valkenburg; het park voelt handig en knus, en de chalets zien er stralend schoon uit.",
        author: "Zoover-review", when: "Recent" },
      google: { name: "Google", score: "4,1", max: "5", pct: 82, count: "1.200 beoordelingen",
        verdict: "Goed",
        quote: "Mooie, moderne huisjes met vriendelijk personeel bij de receptie; ideale uitvalsbasis om Maastricht en Valkenburg te verkennen.",
        author: "Google-review", when: "Recent" },
      special: { name: "BungalowSpecials", score: "8,3", max: "10", pct: 83, count: "",
        verdict: "Zeer goed",
        quote: "Rustig en gezinsvriendelijk park in het Limburgse heuvellandschap; de bourgondische gezelligheid van Maastricht ligt om de hoek.",
        author: "BungalowSpecials", when: "Recent" }
    }
  },

  hogekempen: {
    name: "Hoge Kempen",
    logo: "https://cdn-cms.bookingexperts.com/uploads/theming/logo/image/21/52/Hoge_Kempen%282%29.svg",
    urls: {
      booking: "https://www.booking.com/hotel/be/europarcs-hoge-kempen.html",
      zoover:  "https://www.zoover.nl/a/479779/europarcs-hoge-kempen",
      special: "https://www.bungalowspecials.be/bungalows/europarcs_hoge_kempen.html"
    },
    googlePlaceIdEnv: "GOOGLE_PLACE_ID_HOGEKEMPEN",
    sites: {
      booking: { name: "Booking.com", score: "8,6", max: "10", pct: 86, count: "163 beoordelingen",
        verdict: "Fantastisch",
        quote: "Gasten roemen de rustige ligging aan de rand van Nationaal Park Hoge Kempen; nieuwe, comfortabele accommodaties en vriendelijk personeel.",
        author: "Geverifieerde gast", when: "Recent" },
      zoover: { name: "Zoover", score: "9,0", max: "10", pct: 90, count: "119 beoordelingen",
        verdict: "Fenomenaal",
        quote: "Vakantiegangers genieten van de stralende natuur en het rustige gevoel; keurig onderhouden park, ideaal voor gezinnen die rust en plezier zoeken.",
        author: "Zoover-review", when: "Recent" },
      google: { name: "Google", score: "4,3", max: "5", pct: 86, count: "300+ beoordelingen",
        verdict: "Goed",
        quote: "Prachtige, groene omgeving net over de grens bij Maastricht; fijne uitvalsbasis om te wandelen en fietsen in de Hoge Kempen.",
        author: "Google-review", when: "Recent" },
      special: { name: "BungalowSpecials", score: "7,9", max: "10", pct: 79, count: "",
        verdict: "Prima",
        quote: "Gezellig vakantiepark met vernieuwde accommodaties; ideale uitvalsbasis voor uitstapjes naar Genk, Hasselt en Maastricht.",
        author: "BungalowSpecials", when: "Recent" }
    }
  },

  kraaijenbergseplassen: {
    name: "De Kraaijenbergse Plassen",
    logo: "https://cdn-cms.bookingexperts.com/uploads/theming/logo/image/21/16/De_Kraaijenbergse_Plassen%282%29.svg",
    urls: {
      booking: "https://www.booking.com/hotel/nl/europarcs-de-kraaijenbergse-plassen.html",
      zoover:  "https://www.zoover.nl/a/479659/europarcs-de-kraaijenbergse-plassen",
      special: "https://www.bungalowspecials.nl/bungalows/europarcs_de_kraaijenbergse_plassen.html"
    },
    googlePlaceIdEnv: "GOOGLE_PLACE_ID_KRAAIJENBERGSEPLASSEN",
    sites: {
      booking: { name: "Booking.com", score: "8,0", max: "10", pct: 80, count: "",
        verdict: "Goed",
        quote: "Waterrijk vakantiepark aan de Kraaijenbergse Plassen; fijn voor watersport en gezinnen, met ruime, moderne accommodaties.",
        author: "Geverifieerde gast", when: "Recent" },
      zoover: { name: "Zoover", score: "8,0", max: "10", pct: 80, count: "",
        verdict: "Goed",
        quote: "Mooi gelegen aan het water; rustige ligging en prettige, verzorgde accommodaties.",
        author: "Zoover-review", when: "Recent" },
      google: { name: "Google", score: "4,2", max: "5", pct: 84, count: "721 beoordelingen",
        verdict: "Goed",
        quote: "Ruim opgezet waterpark met een fijne ligging aan de plassen; goede uitvalsbasis in Noord-Brabant.",
        author: "Google-review", when: "Recent" },
      special: { name: "BungalowSpecials", score: "8,0", max: "10", pct: 80, count: "",
        verdict: "Goed",
        quote: "Watervakantiepark met comfortabele accommodaties; ideaal voor een actieve of juist rustige vakantie aan het water.",
        author: "BungalowSpecials", when: "Recent" }
    }
  },

  limburg: {
    name: "Limburg",
    logo: "https://cdn-cms.bookingexperts.com/uploads/theming/logo/image/21/70/Limburg%282%29.svg",
    urls: {
      booking: "https://www.booking.com/hotel/nl/europarcs-limburg.html",
      zoover:  "https://www.zoover.nl/nederland/limburg/susteren/europarcs-limburg/vakantiepark",
      special: "https://www.bungalowspecials.nl/bungalows/europarcs_limburg.html"
    },
    googlePlaceIdEnv: "GOOGLE_PLACE_ID_LIMBURG",
    sites: {
      booking: { name: "Booking.com", score: "7,9", max: "10", pct: 79, count: "501 beoordelingen",
        verdict: "Prima",
        quote: "Rustig gelegen park in Susteren; nette accommodaties en een goede uitvalsbasis om Limburg te verkennen.",
        author: "Geverifieerde gast", when: "Recent" },
      zoover: { name: "Zoover", score: "7,9", max: "10", pct: 79, count: "",
        verdict: "Prima",
        quote: "Prettig, overzichtelijk park in het Limburgse; fijne rust en ruimte.",
        author: "Zoover-review", when: "Recent" },
      google: { name: "Google", score: "4,0", max: "5", pct: 80, count: "",
        verdict: "Goed",
        quote: "Fijne ligging in het Limburgse landschap; goede uitvalsbasis richting Roermond, Maasmechelen en de Maasplassen.",
        author: "Google-review", when: "Recent" },
      special: { name: "BungalowSpecials", score: "7,9", max: "10", pct: 79, count: "",
        verdict: "Prima",
        quote: "Comfortabel vakantiepark in Susteren; centraal gelegen voor uitstapjes in Limburg en net over de grens.",
        author: "BungalowSpecials", when: "Recent" }
    }
  },

  cadzand: {
    name: "Cadzand-Bad",
    logo: "https://cdn-cms.bookingexperts.com/uploads/theming/logo/image/20/99/EuroParcs_EuroParcs-Cadzand-Bad_CMYK%282%29.png",
    urls: {
      booking: "https://www.booking.com/hotel/nl/europarcs-cadzand.html",
      zoover:  "https://www.zoover.nl/nederland/zeeland/cadzand/europarcs-cadzand/vakantiepark",
      special: "https://www.bungalowspecials.nl/bungalows/europarcs_cadzand_.html"
    },
    googlePlaceIdEnv: "GOOGLE_PLACE_ID_CADZAND",
    sites: {
      booking: { name: "Booking.com", score: "7,8", max: "10", pct: 78, count: "678 beoordelingen",
        verdict: "Goed",
        quote: "Nieuw kustpark vlak bij het brede strand van Cadzand-Bad; moderne, goed uitgeruste appartementen met zeezicht.",
        author: "Geverifieerde gast", when: "Recent" },
      zoover: { name: "Zoover", score: "7,8", max: "10", pct: 78, count: "",
        verdict: "Goed",
        quote: "Rustige ligging vlak bij zee; fijne, verzorgde accommodaties aan de Zeeuwse kust.",
        author: "Zoover-review", when: "Recent" },
      google: { name: "Google", score: "4,1", max: "5", pct: 82, count: "",
        verdict: "Goed",
        quote: "Op loopafstand van een van de breedste stranden van Nederland; ideaal voor rust, strand en culinair genieten.",
        author: "Google-review", when: "Recent" },
      special: { name: "BungalowSpecials", score: "7,8", max: "10", pct: 78, count: "",
        verdict: "Goed",
        quote: "Kustpark bij Cadzand met moderne appartementen; perfecte plek voor een strandvakantie in Zeeland.",
        author: "BungalowSpecials", when: "Recent" }
    }
  },

  zeeuwseduinen: {
    name: "De Zeeuwse Duinen",
    logo: "https://cdn-cms.bookingexperts.com/uploads/theming/logo/image/21/34/De_Zeeuwse_Duinen%282%29.svg",
    urls: {
      booking: "https://www.booking.com/hotel/nl/europarcs-de-zeeuwse-duinen.html",
      zoover:  "https://www.zoover.nl/nederland/zeeland/westkapelle/europarcs-de-zeeuwse-duinen/vakantiepark",
      special: "https://www.bungalowspecials.nl/bungalows/europarcs_de_zeeuwse_duinen.html"
    },
    googlePlaceIdEnv: "GOOGLE_PLACE_ID_ZEEUWSEDUINEN",
    sites: {
      booking: { name: "Booking.com", score: "8,4", max: "10", pct: 84, count: "106 beoordelingen",
        verdict: "Zeer goed",
        quote: "Klein, rustig park in Westkapelle op minder dan 500 meter van het strand; moderne accommodaties in het duinlandschap.",
        author: "Geverifieerde gast", when: "Recent" },
      zoover: { name: "Zoover", score: "8,4", max: "10", pct: 84, count: "",
        verdict: "Zeer goed",
        quote: "Kleinschalig en rustig; heerlijk dicht bij het strand van Walcheren, een oase van rust.",
        author: "Zoover-review", when: "Recent" },
      google: { name: "Google", score: "4,2", max: "5", pct: 84, count: "",
        verdict: "Goed",
        quote: "Rustige ligging aan de tip van Walcheren, dicht bij Westkapelle, Zoutelande en Vlissingen.",
        author: "Google-review", when: "Recent" },
      special: { name: "BungalowSpecials", score: "8,4", max: "10", pct: 84, count: "",
        verdict: "Zeer goed",
        quote: "Kleinschalig duinpark vlak bij zee; ideaal voor wie rust en ruimte zoekt aan de Zeeuwse kust.",
        author: "BungalowSpecials", when: "Recent" }
    }
  },

  schoneveld: {
    name: "Schoneveld",
    logo: "https://cdn-cms.bookingexperts.com/uploads/theming/logo/image/22/12/Schoneveld%282%29.svg",
    urls: {
      booking: "https://www.booking.com/hotel/nl/droompark-schoneveld.html",
      zoover:  "https://www.zoover.nl/nederland/zeeland/breskens/europarcs-schoneveld/vakantiepark",
      special: "https://www.bungalowspecials.nl/bungalows/europarcs_schoneveld.html"
    },
    googlePlaceIdEnv: "GOOGLE_PLACE_ID_SCHONEVELD",
    sites: {
      booking: { name: "Booking.com", score: "7,7", max: "10", pct: 77, count: "972 beoordelingen",
        verdict: "Goed",
        quote: "Kustpark bij Breskens op loopafstand van strand en duinen; luxe accommodaties, binnenzwembad en restaurant.",
        author: "Geverifieerde gast", when: "Recent" },
      zoover: { name: "Zoover", score: "7,7", max: "10", pct: 77, count: "",
        verdict: "Goed",
        quote: "Fijne ligging bij het strand van Breskens; ruime accommodaties en volop voorzieningen voor gezinnen.",
        author: "Zoover-review", when: "Recent" },
      google: { name: "Google", score: "4,1", max: "5", pct: 82, count: "",
        verdict: "Goed",
        quote: "Vlak bij zee en de haven van Breskens; fijne uitvalsbasis met Brugge en Knokke op korte afstand.",
        author: "Google-review", when: "Recent" },
      special: { name: "BungalowSpecials", score: "7,7", max: "10", pct: 77, count: "",
        verdict: "Goed",
        quote: "Vijfsterren kustpark aan de Zeeuwse kust; luxe vakantiehuizen dicht bij strand, duinen en gezellige dorpen.",
        author: "BungalowSpecials", when: "Recent" }
    }
  }
};

let lastUpdated = null;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// fetch met timeout, zodat een trage Google-API nooit de ophaalronde blokkeert
async function fetchT(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------- Google (Places API) ----------
// Als enige bron haalt de server dit zélf live op — Google heeft een echte API.
// Booking/Zoover/BungalowSpecials komen uit scores.json (zie hieronder).
async function fetchGoogle(placeId) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key || !placeId) return {};
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total,reviews&language=nl&key=${key}`;
  const r = await (await fetchT(url)).json();
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
// ---------- scores.json inlezen (geschreven door de GitHub Actions-scraper) ----------
// Booking, Zoover en BungalowSpecials worden NIET meer door deze server gescrapet
// (die sites blokkeren servers). Een echte browser op GitHub Actions doet dat elk
// uur en schrijft de uitkomst naar public/scores.json. Wij lezen dat hier in.
function readScoresFile() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "public", "scores.json"), "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null; // bestand bestaat nog niet (bijv. vóór de eerste Actions-run)
  }
}

function applyScraped(parkKey) {
  const park = PARKS[parkKey];
  const scores = readScoresFile();
  if (!scores || !scores.parks || !scores.parks[parkKey]) return;
  for (const source of ["booking", "zoover", "special"]) {
    const d = scores.parks[parkKey][source];
    if (!d) continue;
    const s = park.sites[source];
    if (d.score) {
      s.score = d.score;
      const num = parseFloat(String(d.score).replace(",", "."));
      if (!isNaN(num)) s.pct = Math.round((num / parseFloat(s.max)) * 100);
    }
    if (d.count) s.count = d.count + " beoordelingen";
  }
}

async function refreshPark(parkKey) {
  const park = PARKS[parkKey];
  const placeId = process.env[park.googlePlaceIdEnv];

  // 1) Booking/Zoover/BungalowSpecials uit scores.json
  applyScraped(parkKey);

  // 2) Google live via de officiële Places API
  try {
    const d = await fetchGoogle(placeId);
    const s = park.sites.google;
    for (const [f, v] of Object.entries(d)) {
      if (v == null || v === "") continue;
      s[f] = v;
      if (f === "score") {
        const num = parseFloat(String(v).replace(",", "."));
        s.pct = Math.round((num / parseFloat(s.max)) * 100);
      }
    }
    console.log(`[ok]   ${parkKey}/google`, d);
  } catch (e) {
    console.warn(`[skip] ${parkKey}/google: ${e.message}`);
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

// De server gaat direct "live" (poort open) met de laatst bekende cijfers.
// Het ophalen van verse data gebeurt daarna op de achtergrond en mag de
// opstart nooit blokkeren — anders kan de host (Render) een deploy-timeout geven.
app.listen(PORT, () => {
  console.log(`EuroParcs reviewscherm draait op poort ${PORT}`);
  // eerste refresh los in de achtergrond, fouten volledig afgevangen
  setTimeout(() => {
    refresh().catch(e => console.warn("[refresh] eerste ophaalronde mislukt:", e.message));
  }, 100);
  // en daarna elk uur
  setInterval(() => {
    refresh().catch(e => console.warn("[refresh] mislukt:", e.message));
  }, REFRESH_MS);
});
