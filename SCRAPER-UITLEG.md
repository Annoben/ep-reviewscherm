# Automatische reviewscores — hoe het werkt

Sinds de laatste update haalt het dashboard de scores op via **twee sporen**:

## 1. Google — live vanaf de Render-server
Google heeft een officiële API. De Render-server haalt de Google-score, het
aantal en de laatste review elk uur zelf op. Dit werkt rotsvast, je hoeft er
niets voor te doen (de `GOOGLE_PLACE_ID_*`-variabelen staan al bij Render).

## 2. Booking, Zoover & BungalowSpecials — via een echte browser op GitHub
Deze drie sites blokkeren gewone servers. Daarom draait er **elk uur een echte
browser op GitHub Actions** (gratis) die de scores ophaalt en wegschrijft naar
`public/scores.json`. De Render-server leest dat bestand. Zo omzeilen we de
blokkades zonder dat je Render-tier zwaarder (of duurder) hoeft te worden.

```
GitHub Actions (echte browser)  ->  public/scores.json  ->  Render toont het
        elk uur                         (in de repo)          + live Google
```

---

# Eenmalige instelstappen op GitHub

Je hoeft dit maar één keer te doen.

### A. De bestanden staan al in je repo
Na het uploaden van deze versie staan in je repo:
- `scraper/` (het scraper-script + de URL-lijst)
- `.github/workflows/scrape.yml` (de uur-planning)
- `public/scores.json` (wordt automatisch gevuld)

### B. Zet schrijfrechten aan voor Actions
1. Ga in je repo naar **Settings → Actions → General**.
2. Scroll naar **Workflow permissions**.
3. Kies **Read and write permissions** en klik **Save**.

Dit is nodig zodat de scraper de bijgewerkte `scores.json` terug mag zetten.

### C. Start de eerste run handmatig
1. Ga naar het tabblad **Actions** in je repo.
2. Klik links op **Scrape reviewscores**.
3. Klik rechts op **Run workflow** → **Run workflow**.
4. Na 1–3 minuten zie je een groen vinkje. Er is dan een nieuwe commit
   "Automatische update reviewscores" met de verse cijfers.

Daarna draait het **vanzelf elk uur**.

---

# Een URL aanpassen (als een score niet klopt)

De scores komen van de URL's in **`scraper/parks.json`**. Klopt een cijfer niet,
dan wijst de URL waarschijnlijk naar de verkeerde pagina. Zo pas je 'm aan:

1. Open `scraper/parks.json` op GitHub (potlood-icoon = Edit).
2. Zoek het park en de bron (booking / zoover / special).
3. Plak de juiste URL (de URL uit je adresbalk als je op de reviewpagina bent).
4. **Commit changes**.
5. Ga naar **Actions → Scrape reviewscores → Run workflow** om meteen te
   verversen (anders wacht je tot het volgende hele uur).

> Tip: de belangrijkste is de **Zoover-URL**. Die heeft een nummer zoals
> `/a/121028/...`. Elk park heeft een eigen nummer — controleer dat het klopt.

---

# Wat als een bron tóch geen cijfer geeft?

- **Zoover / BungalowSpecials**: de echte browser haalt deze vrijwel altijd op.
- **Booking**: blokkeert het hardst. Lukt het even niet, dan blijft de laatst
  bekende waarde staan (geen leeg vak). Bij een volgende run probeert hij opnieuw.
- Zie je een bron structureel leeg blijven, controleer dan de URL in
  `scraper/parks.json`. Verandert een site z'n opzet ingrijpend, dan moet de
  uitlezer in `scraper/scrape.js` bijgesteld worden.
