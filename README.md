# Travel Phrasebook

A fast, offline-capable travel companion with essential phrases, culture tips, and travel info for 19 countries. Built as a single-file PWA — no app store, no install, no internet required once loaded.

**Live:** [travelphrasebook.vercel.app](https://travelphrasebook.vercel.app)

---

## Countries

🇫🇷 France · 🇩🇪 Germany · 🇪🇸 Spain · 🇮🇹 Italy · 🇵🇹 Portugal · 🇬🇷 Greece · 🇹🇷 Turkey · 🇲🇦 Morocco · 🇯🇵 Japan · 🇰🇷 Korea · 🇨🇳 China · 🇮🇳 India · 🇹🇭 Thailand · 🇻🇳 Vietnam · 🇮🇩 Indonesia · 🇲🇾 Malaysia · 🇸🇬 Singapore · 🇧🇷 Brazil · 🇲🇽 Mexico

## Features

**Phrases** — 10 categories per country, all with native script, phonetic pronunciation, and tap-to-hear text-to-speech:
- 👋 Greetings · 🍽️ Food · 🗺️ Directions · 🛍️ Shopping · 🔢 Numbers
- 🆘 Emergency · 🏥 Medical · 🛂 Immigration · 🏨 Hotel · 🚌 Transport

**Info** — Culture tips, money advice, local food guide, safety alerts, quick facts, and recommended apps — per country.

**Quiz mode** — Flashcard-style flip quiz with streak tracking and per-country progress saved to local storage.

**Currency calculator** — Live-rate converter, pre-loaded with each country's currency.

**Show to local** — Full-screen display of any phrase to show a local without speaking.

**Emergency modal** — One tap to surface the local emergency number and critical phrases on a high-contrast screen.

**Favourites & recents** — Save phrases across sessions; quickly jump back to recently visited countries.

**Trip planner** — Select multiple countries to see a combined phrase set.

**Country hero banners** — Each phrasebook header is tinted with the country's flag colours.

**Dark mode** — Warm soft-charcoal theme, toggled manually and persisted to local storage.

**PWA / offline** — Service worker caches everything on first load. Works on a plane.

## Tech

| | |
|---|---|
| **Stack** | Single HTML file — HTML, CSS, JS, no build step |
| **Fonts** | Playfair Display (headings) + DM Sans (body) via Google Fonts |
| **Routing** | `history.pushState` + Vercel rewrites (`/:country → /`) |
| **Offline** | Service worker (`sw.js`) with cache-first strategy |
| **Storage** | `localStorage` — favourites, recents, quiz progress, dark mode preference |
| **TTS** | Web Speech API (`speechSynthesis`) |
| **Deploy** | Vercel (static) |

## Local development

No build tools needed — just open the file:

```bash
# Option 1: open directly
open index.html

# Option 2: serve locally (for service worker support)
npx serve .
# or
python3 -m http.server
```

## Deploy

```bash
npx vercel --prod
```

## Structure

```
index.html     # Entire app — HTML, CSS, JS, and all phrase data
manifest.json  # PWA manifest
sw.js          # Service worker (cache-first, versioned)
icon.svg       # App icon
vercel.json    # Rewrite rules for client-side routing
```
