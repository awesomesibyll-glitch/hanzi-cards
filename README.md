# Hanzi Cards

Offline-first iOS/Android app for Chinese → English vocabulary. English interface,
SQLite progress, four-grade spaced repetition, system speech, and native SVG
handwriting practice with stroke-order animation.

## Install on iPhone from Safari

Open **https://hanzi-cards-iphone.tpodpesok.chatgpt.site** in Safari using your
ChatGPT account if prompted. Tap **Share → Add to Home Screen → Add**.
Keep **Open as Web App** enabled if Safari shows that option. Open the new icon
and wait for **Ready offline** before disconnecting.

The web version includes cards, SM-2 scheduling, stroke practice, animation,
Chinese/English speech, adding custom words, JSON backup export and restore.
Progress is saved in IndexedDB on this device. It is separate from the native
app and may also differ between Safari and the installed Home Screen app.
Export and restore a backup to transfer it. Clearing website data can delete it.
Offline speech depends on downloaded system voices; tap Play to enable speech.

Source: `web/`. Built static app: `docs/`. The `docs/` directory can also be
published with GitHub Pages using **main /docs** as the source. No framework,
CDN scripts or remote fonts are needed for this web app.

```sh
node scripts/build-web.mjs
node --test tests/web.test.mjs
node scripts/serve-web.mjs
```

The local preview is at http://127.0.0.1:8766. `build-web.mjs` generates browser
modules from the same scheduling and stroke-validation functions as the native
app, and a content-versioned service worker that caches all required assets.
The Check iPhone web app workflow validates the backup format, offline routing,
precache coverage, install metadata and generated-file consistency.

## Run locally

Install Node.js 24 LTS with npm, then:

```sh
git clone https://github.com/awesomesibyll-glitch/hanzi-cards.git
cd hanzi-cards
npm ci
npm run prepare:data
npm run typecheck
npm test
npx expo start
```

Scan the QR code with a compatible Expo Go app. This project uses Expo SDK 57.
Android Emulator: `npm run android`. iOS Simulator requires macOS/Xcode:
`npm run ios`. Mobile bundle check: `npm run export:mobile`.
The retained `scripts/setup.mjs` is unnecessary for this installed project.

## Install the Android APK

Open [Actions](https://github.com/awesomesibyll-glitch/hanzi-cards/actions), select
a successful **Check and build Android** run, and download
**hanzi-cards-android-apk** while signed into GitHub. Extract the ZIP and install
the APK. It bundles JavaScript and character data and needs no development server.

This personal testing build uses a generated development signing key, not a
Google Play release key. Builds with different keys may require uninstalling
the old app, deleting its local progress. Backup/export is not implemented yet.
For stable releases, configure your own signing credentials with EAS or Gradle.
`eas.json` includes an internal preview APK profile. iPhone installation requires
your Apple signing account or a simulator build on macOS.

## Included features

- Hanzi front; tone-marked Pinyin and English translation on reveal.
- Again, Hard, Good, Easy; persistent review history and next due times.
- Chinese speech on opening; Chinese/English replay buttons.
- Level/topic filters and overdue reviews before new cards.
- Per-character tracing, ordered trajectory checks, clear/retry and animation.
- Locally bundled graphics for all available characters in the word pack.
- Automated checks and Android APK compilation in GitHub Actions.

## Offline speech

Download Chinese and English system voices first. Offline availability depends
on the phone and selected TTS engine; verify both languages in airplane mode.
On iPhone disable silent mode if speech is inaudible. No external audio API,
API keys or audio-file cache are used: this implementation uses system TTS.

## Vocabulary and licensing

The starter includes **six original demonstration words**, not a full HSK course.
Replace `src/data/words.json` with a licensed pack of the same structure and run
`npm run prepare:data`. Indexed SQLite queries support thousands of records;
levels 1–9 and topics are supported. Identify the HSK edition of imported data.
Stable word IDs preserve progress across content updates.

Make Me a Hanzi data, distributed through hanzi-writer-data, has a separate
Arphic Public License. See [notices](THIRD_PARTY_NOTICES.md) and `licenses/`.
Application source is MIT. No HelloChinese content is copied. Stroke checking
is an approximate teaching aid, and scheduling is a four-grade SM-2 adaptation.

## Architecture and plan

See [the detailed Russian development guide](DEVELOPMENT.md) for the file tree,
SQL schema, scheduling formula, handwriting algorithm, import instructions,
manual acceptance scenarios and the phased development plan.
Use the installation commands in this README for this ready-to-install repository.

Core files: `App.tsx`, `src/db.ts`, `src/srs.ts`, `src/speech.ts`, `src/strokes.ts`,
`src/components/Flashcard.tsx`, `src/components/WritingCanvas.tsx`.

## Validation

```sh
npm run typecheck
npm test
python scripts/check-schema.py
npx expo install --check
npm run export:mobile
```

GitHub Actions runs these checks before compiling the APK. Speech, touch input,
restart persistence and airplane-mode behavior still require physical-device
testing. A JS bundle export alone does not validate every device scenario.
