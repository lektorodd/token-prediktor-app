# Tokenspå 🔮

Ein liten app for å utforske neste token og sjå korleis temperatur påverkar dei valde tokena. Du skriv inn ein prompt, og får:

- **Token‑fana**: Sannsyns‑diagram for neste token (med piltastar/space for å velje).
- **Temperatur‑fana**: Fleire parallelle utfall med ulike temperaturar, eitt token om gongen.
- **Global `top_p`‑slider**: Avgrensar utvalet til dei mest sannsynlege tokena.

## API‑nøkkel og .env

Appen brukar OpenAI API. Legg nøkkelen din i ei lokal `.env`‑fil:

```
OPENAI_API_KEY=din_nøkkel_her
```

`.env` er lagra i `.gitignore`, så han blir ikkje committa til GitHub.
Del aldri API‑nøkkelen offentleg.

## Køyre lokalt

1. Installer avhengigheiter:
```
npm install
```

2. Set API‑nøkkel i `.env`:
```
OPENAI_API_KEY=din_nøkkel_her
```

3. Start appen:
```
npm run dev
```

4. Opne:
```
http://localhost:3000
```

## Notat om sampling

- **Temperatur** styrer kor tilfeldig modellen blir (høgare = meir kreativ/kaotisk).
- **top_p** avgrensar val til dei mest sannsynlege tokena (lågare = tryggare).
