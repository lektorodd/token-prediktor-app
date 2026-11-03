# Tokenspå 🔮

> [!CAUTION]
> **Modellen appen var laga for, er stengd (oppdatert 3. november 2026)**
>
> Tokenspå var bygd på `gpt-3.5-turbo-instruct` og det gamle `/v1/completions`‑API‑et. OpenAI stengde begge den 28. september 2026. Appen er no tilpassa **Chat Completions** og ein chat‑modell (standard `gpt-4.1-mini`). Han oppfører seg **ikkje heilt likt** den gamle modellen:
>
> - **Sannsyna er spissare.** Chat‑modellar er trente til å gi eitt godt svar, så det mest sannsynlege tokenet får ofte over 90 %.
> - **Modellen får ein instruks.** Han blir beden om å gjenta slutten av teksten og så halde fram, i staden for å sjå berre teksten din.
> - **Temperatur og `top_p` blir rekna ut i appen**, ikkje hos OpenAI, ut frå dei 20 mest sannsynlege tokena.
> - **Temperatur over 2 er ein simulering.** Tilfeldige token frå heile ordforrådet blir blanda inn, slik den gamle modellen ville ha gjort.
>
> Sjå [Endringar etter at modellen vart stengd](#endringar-etter-at-modellen-vart-stengd) for detaljar.

![Forside](front-page.png)

## 1) Kva gjer appen?
Tokenspå viser kva modellen trur kjem **neste**, og korleis **temperatur** og sampling‑val endrar token‑vala.

- **Token‑fana** viser eit sannsyns‑diagram for neste token.
- **Temperatur‑fana** viser fleire parallelle forslag med ulike temperaturar (standard 0, 0, 1, 1, 2 og 5).
- Under **Avanserte kontrollar** finn du:
  - **`top_p`**: avgrensar utvalet til dei mest sannsynlege tokena (berre i temperatur‑fana, standard 1).
  - **`top_k`**: kor mange av dei mest sannsynlege tokena som blir viste (opptil 20).
  - **Token per steg**: kor mange token som blir henta per steg i temperatur‑fana.

## 2) Kom i gang

### Steg A: Få ein OpenAI API‑nøkkel
1. Logg inn på OpenAI‑kontoen din.
2. Lag ein ny API‑nøkkel.
3. Ta vare på nøkkelen.

### Steg B: Få appen på maskina di
1. Last ned eller klon prosjektet til maskina di.
2. Opne eit terminal‑vindauge i prosjektmappa.

### Steg C: Set opp nøkkelen
1. Lag ei fil som heiter `.env` i prosjektmappa.
2. Legg inn nøkkelen slik:
```
OPENAI_API_KEY=din_nøkkel_her
```
Valfritt: vel modell (standard er `gpt-4.1-mini`). Modellen må støtte `logprobs`:
```
OPENAI_MODEL=gpt-4.1-mini
# Berre for resonneringsmodellar som berre gir logprobs utan resonnering:
# OPENAI_REASONING_EFFORT=none
```
Test kva modellar som fungerer med:
```
npm run check -- gpt-4.1-mini gpt-4o-mini
```
Denne fila er lokal og blir ikkje brukt av appen utan at du lagar ho sjølv. Del aldri API‑nøkkelen offentleg.

### Steg D: Start appen
1. Installer avhengigheiter (køyr på nytt etter `git pull`, sidan det kan ha kome nye):
```
npm install
```
2. Start appen:
```
npm run dev
```
3. Opne nettlesaren:
```
http://localhost:3000
```

### Steg E: Bruk appen
- Skriv inn tekst i feltet.
- Trykk **Start** for å låse teksten.
- Bruk **piltastar/space** for å velje og legge til token, eller trykk **Vis neste token** for å legge til det valde (som standard det mest sannsynlege) tokenet.
- I **Temperatur‑fana**: Trykk **Neste token** for å avsløre eitt steg i alle felt.

## Endringar etter at modellen vart stengd

*Oppdatert 3. november 2026.*

| | Før (`gpt-3.5-turbo-instruct`) | No (`gpt-4.1-mini` eller `OPENAI_MODEL`) |
|---|---|---|
| API | `/v1/completions` | `/v1/chat/completions` med `logprobs` og `top_logprobs` |
| Det modellen ser | Berre teksten din | Ein instruks, teksten din og slutten av teksten (opptil 200 teikn) som han skal gjenta |
| Neste token | Første token modellen skriv | Første token etter den gjentekne teksten |
| Tal på alternativ (`top_k`) | Opptil 15 | Opptil 20 |
| Temperatur | Rekna ut hos OpenAI, 0–2 | Rekna ut i appen frå dei 20 beste tokena, heile tal 0–5 |
| Temperatur 0 | Same tekst kvar gong | Same tekst så lenge serveren køyrer (svara blir lagra) |
| Over 2 | – | Simulert volapyk |

**Kvifor modellen gjentek slutten av teksten.** Ein chat‑modell startar alltid eit nytt svar. Første token i eit svar har nesten aldri mellomrom framfor seg («så» i staden for «␠så»), og modellen kan ikkje halde fram midt i eit ord. Når han først skriv opp att slutten av teksten, ligg det neste tokenet midt i teksten, og mellomrom og halve ord blir rette. Gjentek han ikkje teksten rett, prøver serveren med berre det siste ordet. Går ikkje det heller, blir det skrive ei melding i terminalen.

**Kvifor temperaturen blir rekna ut i appen.** Chat‑modellane er ikkje heilt deterministiske, sjølv med temperatur 0. Difor hentar serveren dei 20 mest sannsynlege tokena (same liste som i token‑fana), tek vare på dei så lenge han køyrer, og trekkjer sjølv med temperatur og `top_p`. Temperatur 0 gir då alltid det mest sannsynlege tokenet, så like felt får nøyaktig same tekst.

**Kvifor `top_p` er 1 og ikkje lenger blir brukt i token‑fana.** Chat Completions sender berre tilbake token innanfor `top_p`, så med 0.9 forsvann alternativa (éin rad på 100 %). I temperatur‑fana gjorde 0.9 at det ofte berre var eitt token igjen ved temperatur 1.

**Volapyk‑modus over 2 (simulering).** API‑et gir berre dei 20 beste tokena. Den gamle modellen kunne trekke frå heile ordforrådet, rundt 200 000 token, og høg temperatur gav difor volapyk. Over 2 legg appen til resten av ordforrådet som ein «hale». Halen får den sannsynsmassa dei 20 beste tokena ikkje dekkjer, og massa blir fordelt etter ein potenslov som held fram frå det 20. tokenet. Når halen blir trekt, blir eit tilfeldig ekte token frå ordforrådet til modellen (o200k) sett inn. Desse tokena kjem **ikkje** frå modellen, og felta blir merkte «simulert».
