Saved as `ALGORITHMS.md` in the project. Here it is in full:

# SpeakScribe — Algorithm Reference

## 1. Continuous Speech Recognition Loop
**File:** `SpeechEngine.kt`

1. Start listening with `ACTION_RECOGNIZE_FORM`, partial results enabled, silence timeouts extended to 60s (silence is a *feature*, not an error).
2. On each `onResults`, emit the final hypothesis and immediately re-issue `startListening()`.
3. On recoverable errors (`ERROR_NO_MATCH`, `ERROR_SPEECH_TIMEOUT`), silently restart rather than surfacing an error.
4. On hard errors, surface a message and stop.

- **Triggering model:** push-based, callback-driven (`SpeechListener` interface).
- **One-shot mode:** a flag suppresses auto-restart; used by the assistant profile editor and the wake handoff.

## 2. Pause Detection (Breath / Audience Hums)
**File:** `MainActivity.kt` — `pauseWatcher`

A polling state machine over speech activity timestamps.

- On every final/partial result, `lastPartialAt` is stamped.
- A `Handler` loop polls every 250ms; `idleSec ≥ 1.5s` → **breath hum** (440 Hz, 120 ms, latched once per silence); `idleSec ≥ 4.0s` → **audience hum** (280 Hz, 400 ms, latched).
- Any new speech resets both latches.

- **Model:** threshold state machine with one-shot latching. O(1) per tick.

## 3. Word-Count Hum
**File:** `MainActivity.kt` — `onFinalText()`

- Maintain `wordsSinceHum`, incremented by the token count of each final utterance.
- When `wordsSinceHum ≥ 100`, reset and emit a two-tone chime (520 Hz → 700 Hz, staggered 140 ms).
- Counts only *final* results to avoid double-counting partials.

## 4. Mile-Timer Vocal Stamps
**File:** `MainActivity.kt` — `scheduleMileMarker()`

- Post a delayed runnable at `mileMarkerMin × 60,000 ms` (5 min).
- On fire: increment elapsed minutes, count transcript words, TTS-speak `"<N> minutes. Approximately <W> words."`
- Re-schedules itself (self-perpetuating interval timer); cancelled on session stop.

## 5. Hum Tone Synthesis
**File:** `AudioFeedback.kt` — `hum(hz, ms)`

Pure-software sine synthesis (frequencies are per-profile configurable, so fixed beeps are insufficient).

1. 22050 Hz, 16-bit PCM buffer of `sr × ms/1000` samples.
2. Each sample: `sin(2π·hz·i/sr) × 9000 × envelope(i)`.
3. Envelope = min(linear 10 ms attack, linear 20 ms decay, 1.0) — kills click transients so it reads as a *hum*.
4. Played via `AudioTrack` (MODE_STATIC) on a dedicated thread.

- O(n) sample generation; n ≈ 22.05 × ms samples.

## 6. Terminology & Corrective Suggestion Engine
**File:** `SuggestionEngine.kt`

1. **Exact correction pass** — lowercase tokens hash-lookup in `profile.corrections` (e.g., `"tract shin" → "traction"`). O(1) per token.
2. **Terminology prefix pass** — for each token ≥ 3 chars, test whether any profile term starts with its first 4 characters.
3. Deduplicate via `LinkedHashSet`, cap at 5 suggestions.
4. **Apply:** replaces the *last* case-insensitive occurrence of the heard string.

- **Upgrade path:** phonetic matching (Metaphone) or an on-device neural LM reranker behind the same interface.

## 7. Word-Trigger Slide Coach
**File:` `SlideCoach.kt`

- `TriggerModel.onWord(word, profile) → String?` abstracts the decision.
- Baseline (`RuleBasedTriggerModel`): exact case-insensitive match on `defaultTrigger`; on match, advance a cycling index into `slidePrompts` and return the next prompt, spoken via TTS.
- Tokens produced by `split(Regex("[^A-Za-z]+"))` over each final utterance.
- **ML upgrade path:** a TFLite context classifier implementing `TriggerModel` — distinguishes an intentional "next" from conversational usage, no caller changes needed.

## 8. Personal Assistant Profile Generator
**File:** `AssistantProfile.kt`

- State: two persisted answers (`worldAndNeeds`, `career`) in `SharedPreferences`.
- Two-step wizard speaks "Tell me your world and needs." then "Tell me your career."; answers captured via one-shot recognition with an error retry loop.
- **Prompt synthesis:** template-based NLG — four coaching strings with stored values interpolated.

## 9. Passive Wake Detection
**File:** `PassiveListenerService.kt`

1. `AudioRecord` at 16 kHz mono captures frames on a background thread.
2. Per frame, **RMS energy**: `sqrt(Σ xᵢ² / n)`.
3. `EnergyWakeDetector` state machine: > 18 consecutive frames above RMS 1500 (≈ 600 ms sustained sound) → **wake event**, followed by a ~10 s refractory cooldown for debouncing.
4. Wake launches `MainActivity` with `ACTION_WAKE`, which starts an active session.

- **Model:** energy threshold with hysteresis. **Placeholder status:** production path is an on-device wake-word model (Porcupine / openWakeWord / Vosk) behind the same `WakeDetector` interface; audio is analyzed and discarded locally either way.

## 10. Bluetooth Microphone Routing
**File:** `MainActivity.kt` — `routeBluetoothMic()`

1. Query bonded devices for `Major.AUDIO_VIDEO` class.
2. If present: `startBluetoothSco()` before recognition; `stopBluetoothSco()` on session end.
3. SCO state surfaced as `BT mic (active|passive)`.

## Cross-cutting Design Notes

| Concern | Approach |
|---|---|
| Threading | Mic/audio on dedicated threads; UI mutations via `runOnUiThread` |
| Privacy | On-device recognition and wake detection; passive audio discarded; persistent notification |
| Extensibility | Algorithms behind interfaces (`TriggerModel`, `WakeDetector`, `SpeechListener`) so ML models swap in without caller changes |
| Per-profile tuning | All hum frequencies, thresholds, cadences centralized in `HumConfig` |

