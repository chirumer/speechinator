# [PLACEHOLDER]

A phone-sized web app for practicing speeches. It listens passively, transcribes you live, follows along in your script, and coaches you with audio cues. The phone demo is on the left; a **What's Happening** board on the right shows the live signals behind it.

Live: https://voice-app.cloud.anbaric.ai

## Run it

```bash
npm install
./run.sh          # starts the server on :3000 and opens a 1440×900 Chrome window
```

Use **Chrome**. Speech recognition needs it, and the microphone needs `https` or `localhost`.

## What's used, and for what

| Piece | Used for |
|---|---|
| **Web Speech API** (`SpeechRecognition`, built into Chrome) | Default real-time voice-to-text. Streams interim results, which feed the bottom banner, the script tracker and the Workspace transcript. In Chrome, the audio is processed by Google's speech service. |
| **Whisper `tiny.en`** via [transformers.js](https://github.com/huggingface/transformers.js) (runs in a Web Worker, on-device) | Second transcription engine, fed from the same mic stream as the wake graph. It needs no Google service and has no recognition sessions to restart. The model (about 40 MB) downloads on first use and is then cached. It is picked automatically when Chrome's recognizer reports nothing while the mic is clearly hearing speech, or manually from the **Transcription** menu above the What's Happening box. |
| **Web Speech API** (`speechSynthesis`, built into the browser) | Spoken output: the minute stamps ("5 minutes. Approximately 640 words.") and slide-coach prompts. It uses whatever voice the browser or OS provides. It is not the Google Cloud TTS API. |
| **Web Audio API** | (1) Synthesizes the hum tones as sine waves. (2) Reads microphone energy (RMS) for passive wake detection. |
| **`getUserMedia` / `enumerateDevices`** | Microphone access, and listing input devices to spot a Bluetooth mic. |
| **Fuzzy matching** (own code: Levenshtein + phonetic keys) | Keeps the script box in sync despite transcription errors, mispronunciations, skipped words, and jumps ahead or back. |
| **[Anbaric](https://www.npmjs.com/package/anbaric)** (TypeScript, `src/main.ts`, `src/machine.ts`) | Hosting, plus a `sessions` state machine that records each session (title, words, chimes, stamps) and scores it into duration, words per minute and pace (slow, steady or fast). |
| Plain HTML/CSS/JS (`public/index.html`) | The whole front end. No framework and no build step. |

### Not used

- **No VAD model** (e.g. Silero). Detecting that you're speaking comes from the recognizer's results, and wake detection uses a simple energy threshold. Silero VAD is only in the separate `speech-breath` project.
- **No Google Cloud TTS** and **no Claude / Anthropic API**. Nothing in this app calls an LLM. All coaching is rule-based.

## Features and the algorithms behind them

These follow the algorithm reference in `copy.md`.

1. **Continuous recognition loop.** Chrome ends a recognition session on its own after silence or a result, and the app restarts it right away. Those browser-driven restarts are not counted or shown to the user. Only real errors are shown.
2. **Pause detection.** A 250 ms poll. After 1.5 s of silence it plays a breath hum (440 Hz). After 4.0 s it plays an audience hum (280 Hz). Each fires once per silence.
3. **Word-count hum.** A two-tone chime (520 → 700 Hz) every 100 final words.
4. **Mile-timer stamps.** Every 5 minutes (or 1, selectable) it speaks the elapsed minutes and word count.
5. **Hum synthesis.** 22,050 Hz sine tones with a 10 ms attack and 20 ms decay, so they sound like hums, not clicks.
6. **Terminology and corrections.** Exact lookups of known mis-hearings (e.g. "road map" → "roadmap") plus a prefix match against project terms. Up to 5 suggestions, applied to the last occurrence.
7. **Slide coach.** Saying "next" advances through slide prompts built from the script's sections and speaks the next one.
9. **Passive wake detection.** Microphone RMS above 1500 for 18 straight frames (about 600 ms) wakes the app, then a 10 s cooldown. From the home screen it opens Workspace.
10. **Bluetooth mic status.** Shows the input devices and "BT mic (active/passive)". The browser can't route the Bluetooth audio itself.

Item 8 of `copy.md` (the personal assistant profile wizard) is not implemented.

### Script tracking

The script box highlights your place and scrolls with you. It matches the last five heard words against the script by spelling, by sound, and as partial words. That absorbs mishearings and mispronunciations.

- **Skipping ahead or jumping back:** the whole script is searched, and a jump needs two consecutive matching updates before it happens.
- **Skipped words:** skipped passages turn amber and are counted.
- **Manual override:** tapping any word repositions the tracker.

## Guided Speech projects

- Pick a sample (Q3 roadmap review, engineering standup, budget proposal, customer onboarding) or upload a `.txt` file to create a project. Uploads are saved in the browser's local storage.
- Opening a project shows a summary: word count, estimated time, number of sections and key terms.
- Paragraphs become sections, and sections become slide prompts.

## Project layout

```
public/index.html   the whole front end (phone UI + What's Happening board)
src/main.ts         HTTP server: serves the page, session API (/api/sessions)
src/machine.ts      the `sessions` state machine (record → score → completed)
run.sh              local launcher
.anbaric/           deployment config
```

Deploy with `anbaric app update`.

## Limits

- Transcription accuracy and latency depend on Chrome's recognizer, and it needs an internet connection.
- The page is laid out for a 1440×900 window and scales to fit other sizes.
