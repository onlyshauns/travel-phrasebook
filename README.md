# Travel Phrasebook

Offline phrasebook for 19 countries: phrases with pronunciation, culture and safety notes, a quiz, and emergency numbers you can call. One static site, no build step.

**Live:** [travelphrasebook.vercel.app](https://travelphrasebook.vercel.app) once this branch is deployed. This repository does not deploy itself.

## Countries

France, Germany, Greece, Italy, Portugal, Spain, China, Japan, Korea, India, Indonesia, Malaysia, Singapore, Thailand, Vietnam, Turkey, Brazil, Mexico, Morocco.

Singapore is English and Singlish. Morocco uses romanized Darija for most phrases and Arabic script for hotel and transport, with an Arabic font on those lines.

## What the app does

- Tap a phrase, or the round play button, to hear it. **Slower** repeats it at 0.65×. If the phone has no voice for that language, the row says so and keeps the pronunciation on screen.
- **Show** opens the native line full screen for someone else to read. English stays hidden until "Also show English".
- Emergency is one call button per service. Japan is 110 and 119. Singapore is 999 and 995.
- Info is a definition list. **Convert USD** opens a calculator that uses a June 2024 snapshot, not a live rate.
- The trip sheet lists emergency numbers, that same snapshot, and a few apps. It is not a combined phrase list.
- Favourites, recents, quiz progress, and the theme stay in `localStorage`.

France phrases, including the numbers 30–1000, live in `data/france.json`. [french-phrasebook](https://github.com/onlyshauns/french-phrasebook) copies that file. Change it here, then copy it across, so the two apps do not drift.

## Layout

```
index.html              Shell
css/app.css             Layout and theme
js/app.js               UI
js/phrase-utils.js      Speech, script, and tel helpers
data/index.json         Country list
data/<country>.json     Phrases and notes
sw.js                   Offline cache. Only successful responses are stored.
scripts/check-content.mjs
```

`node scripts/check-content.mjs` checks every country for missing sections, duplicate English lines, undialable emergency numbers, the Singapore language, and the France/Japan numbers.

## Local preview

```bash
python3 -m http.server
```

Open `http://127.0.0.1:8000`. The service worker only registers on `http://` or `https://`, not from a `file://` page.
