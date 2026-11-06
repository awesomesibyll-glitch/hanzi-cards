# Hanzi Cards

Offline-first iOS/Android app for Chinese → English vocabulary. English interface,
SQLite progress, four-grade spaced repetition, system speech, and native SVG
handwriting practice with stroke-order animation.

## Install on iPhone from Safari

The installed web app now has two independent courses: **10,969 Chinese → English
words** (HSK 3.0 2021, HSK 1–6 plus a combined 7–9 band) and **5,973 English →
Russian words** (community CEFR A1–C2). Choose a course and level above the cards.
English translations and levels are AI-generated and not human-verified; they
may contain errors. The existing six card IDs and review progress are preserved.

**Audio** lets you choose American or British English, a matching system
voice and playback speed. Word playback tries attributed human recordings
from Wikimedia Commons or Free Dictionary API when enabled. Downloaded
recordings can replay offline. Web Speech handles sentences and words without
recordings, preferring Enhanced and Premium on-device voices when available.
Choose **System voices only** to keep pronunciation entirely on the device.

**Study settings** switches between classic cards, typing the answer and
**Fill the gap**. Gap-fill cards use examples containing the exact target word
and share the same review schedule as the other modes. In
active recall, Chinese answers accept Hanzi or pinyin. The daily new-word cap
is shared across courses, with 10 by default and 20 or 50 as options. Previously
scheduled reviews remain available after reaching the cap. Custom words require
a sentence and translation. Built-in words have curated examples where available
and bilingual practice sentences elsewhere. The Chinese add-word form includes
an offline pinyin picker for common expressions.
The B2–C2 English examples are original sentences paired with Russian translations.

**Practise my mistakes** opens a separate queue for the selected course and
filters. It uses Poor ratings and incorrect typed answers saved with a grade.
Practice does not record reviews, change due dates or consume the daily new-word cap.

**Menu → Search & study sets** searches both courses by word, pinyin or
translation. Create a named set, add existing words and choose **Study this
set** to practise just those words with their usual review schedules. Sets are
stored on the device and included in exported backups.

**Menu → Import word list** accepts up to 300 rows pasted from a spreadsheet.
The standard order is word, translation, pinyin or IPA, example sentence,
sentence translation, level and topic. A recognised header allows columns
to be reordered. Chinese words require pinyin. Omitted levels default to
HSK 1 or A1. Review the preview, then import into the library or a selected
set. Existing words and invalid rows are skipped.

Expanded words and all 2,970 Chinese stroke guides are bundled in compressed
files (~1.5 MB total). This requires a browser with DecompressionStream support
(modern Safari/iOS). See THIRD_PARTY_NOTICES.md for catalog licenses and sources.
The React Native starter still has its original six-word demo; these expanded
courses are delivered in the published iPhone web app.

After enabling GitHub Pages, open **https://awesomesibyll-glitch.github.io/hanzi-cards/**
in Safari. Tap **Share → Add to Home Screen → Add**.
Keep **Open as Web App** enabled if Safari shows that option. Open the new icon
and wait for **Ready offline** before disconnecting.

The web version includes cards, SM-2 scheduling, stroke practice, animation,
Chinese/English speech, adding custom words, JSON backup export and restore.
Custom words, study settings and review history are saved in localStorage.
Existing IndexedDB progress in the same browser profile is migrated on first
launch. Browser storage is separate from the native app and may also differ
between Safari and the installed Home Screen app. Export and restore a backup
or use optional GitHub Sync to transfer progress.
Offline speech depends on downloaded system voices; tap Play to enable speech.

## Install on Windows and sync across devices

Open [Hanzi Cards](https://awesomesibyll-glitch.github.io/hanzi-cards/devices.html)
in Microsoft Edge. Choose **… → More tools → Apps → Install this site as an app**.
Launch it from Start or pin it to the taskbar.

1. Create a [fine-grained GitHub token](https://github.com/settings/tokens?type=beta)
   with the account permission **Gists: Read and write**. Repository access is unnecessary.
2. On the device with your existing progress, open **GitHub Sync**. Enter the token
   and a strong sync password of at least 12 characters. Leave **Sync ID** blank,
   press **Sync now**, then copy the resulting ID.
3. On the second device, enter the ID, the same password, and a token from the same
   GitHub account. Press **Sync now**. Run sync on each device when switching.

This feature syncs reviews and custom cards in the installed web app. It merges
review history and rebuilds affected schedules. Audio settings and cached audio
stay local. A secret GitHub Gist contains encrypted data and random device IDs.
The app keeps the token and password in memory until you reload or close the app.
Keep a copy of the password and ID in your password manager.

Source: `web/`. Built static app: `docs/`. The `docs/` directory can also be
published with GitHub Pages using **main /docs** as the source. In repository
Settings → Pages, choose **Deploy from a branch**, **main**, **/docs**, then Save.
No framework,
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
