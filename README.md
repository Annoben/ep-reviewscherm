# EuroParcs Reviewscherm (zelfdraaiend) — meerdere parken

Een TV-dashboard voor op kantoor. Toont de reviewscore + laatste reactie van
**Booking.com, Zoover, Google en BungalowSpecials** — voor **meerdere parken**
(nu Maasduinen en Poort van Maastricht). Bovenin schakel je met logo-knoppen
tussen de parken. Met de **officiële EuroParcs-logo's**, icoon-knoppen om elke
bron te tonen/verbergen, en **automatische verversing elk uur**.

Zodra je dit host, draait alles vanzelf — geen pc die aan moet blijven, geen
handmatig bijwerken.

---

## Hoe het werkt (kort)
Het is één kleine **Node-server** (`server.js`) die twee dingen doet:
1. **elk uur** zelf de cijfers ophaalt en in het geheugen bewaart;
2. het scherm serveert op `/` en de data op `/api/data`.

Het scherm laadt elk uur opnieuw en toont de laatst opgehaalde cijfers. Omdat de
server het ophalen doet (en niet de browser), werkt het ophalen van Booking/Zoover
wél — dat kan een losse HTML-pagina niet.

---

## Waar hosten? (advies)
**Render.com — gratis.** Simpelste route naar "hosten en klaar":
1. Zet deze map in een GitHub-repo.
2. Render → **New → Web Service** → koppel de repo.
3. Build command: `npm install` · Start command: `npm start`.
4. Zet onder **Environment** de variabelen uit `.env.example`.
5. Deploy. Je krijgt een URL zoals `https://ep-reviewscherm.onrender.com`.
   Open die op de tv, F11 voor volledig scherm.

> Let op: op de gratis tier valt een Render-service in slaap bij inactiviteit.
> Omdat de tv de pagina elk uur herlaadt, wordt hij vanzelf gewekt; wil je hem
> gegarandeerd wakker houden, gebruik dan de betaalde "Starter" tier of een
> uptime-pinger.

**Alternatieven:** Railway, Fly.io, of een eigen **VPS/kantoorserver**
(`npm install && npm start`, draaien via pm2 of systemd). Dezelfde code.

**Puur statische webruimte werkt NIET** voor automatisch ophalen — dan mist de
server-laag. In dat geval kun je alleen handmatige cijfers tonen.

---

## Lokaal testen
```
npm install
cp .env.example .env      # vul in wat je hebt (mag ook leeg voor een eerste test)
npm start
```
Open http://localhost:3000 . Zonder ingevulde keys draait alles met de laatst
bekende cijfers; Booking/Zoover/BungalowSpecials worden alsnog live geprobeerd.

---

## Google API instellen (voor de Google-rating)
1. Ga naar **Google Cloud Console** → maak een project.
2. Schakel **Places API** in.
3. **Credentials → API key** aanmaken. Beperk hem tot Places API.
4. Zoek het **place_id** van EuroParcs Maasduinen op via de Place ID Finder:
   https://developers.google.com/maps/documentation/places/web-service/place-id
   (zoek "EuroParcs Maasduinen Belfeld" → kopieer de place_id).
5. Zet in je env: `GOOGLE_API_KEY=...` (één key voor beide parken) plus
   `GOOGLE_PLACE_ID_MAASDUINEN=...` en `GOOGLE_PLACE_ID_POORTVANMAASTRICHT=...`

De Places API geeft rating, aantal reviews én de nieuwste review-tekst terug —
die verschijnt automatisch als "laatste reactie" op de Google-tegel.
(De gratis maandlimiet is ruim voldoende voor 24 opvragingen per dag.)

---

---

## Cijfers bijstellen zonder API
De laatst bekende waarden staan bovenaan `server.js` in het `state`-object.
Pas ze daar aan als je iets handmatig wilt overschrijven; bij de volgende
uur-refresh worden ze door live data vervangen zodra de betreffende bron werkt.

## Onderhoud
- Reviewsites wijzigen soms hun HTML. Werkt Booking/Zoover/BungalowSpecials niet
  meer, dan moet de betreffende selector in `server.js` bijgesteld worden. Tot die
  tijd blijft de laatste waarde staan (nooit leeg overschreven).
- BungalowSpecials deelt dezelfde reviewpool als de DE/BE-varianten — niet dubbel
  toevoegen.

## Een park toevoegen
Open `server.js` en kopieer in het `PARKS`-object een bestaand parkblok. Pas aan:
de `name`, de `logo`-URL, de drie scrape-URL's (booking/zoover/special), en
`googlePlaceIdEnv` (de naam van de env-variabele met het Google place_id van dat
park). Voeg die env-variabele daarna bij Render toe. De park-schakelaar en tegels
verschijnen dan vanzelf.
