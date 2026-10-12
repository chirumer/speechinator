# Speechinator

Prepare and practice a speech. Speechinator learns how you speak, edits your script to suit you, follows along as you read it aloud, coaches your pace and pauses, and scores the result against a rubric.

Pastel orange, runs in the browser, deployable to [Anbaric](https://cloud.anbaric.ai).

## How it works

1. **Profile.** A prefilled, scrollable form of 20 questions about your voice, language, style, habits and preferences. A sticky **Next** button appears once the required questions are filled. You can download your details as JSON and load them back.
2. **Workspace.** Your sessions, one per speech. **New session** starts an *Untitled* one.
3. **Preparation.** Drop your script into the dotted box (a `.txt` or `.md` file, pasted text, or one of the draggable **sample scripts**) and set the session details: purpose, time limit, audience, audience region and purpose priorities. A sample fills all five.
4. **Suggestions.** A Claude model proposes small edits to the script: filler words, idioms for international audiences, words you stumble on, your preferred words kept. **Accept** or **Reject** each edit, or all at once. A **Model** menu at the top picks the model; the default is Haiku 5.5, the cheapest.
5. **Practice.** Read your script aloud. The current word is highlighted and the script scrolls with you, even if you mispronounce words, skip ahead or jump back. A **pace** card shows how far ahead or behind schedule you are, overall and over the last 20 seconds. **Pauses** are timed quietly in light gray. **Pause**, **Stop** and **End recording** are all available.
6. **Summary.** Ending a recording opens the summary: an overall score out of 5, a **core rubric** (nine dimensions) and a **script versus what you said** comparison, scored by Jev. The speaker transcript is shown, and for the demo scripts you can swap in a sample transcript and the scores recalculate. Every recording, its transcript and its rubric is saved, and the **Past recordings** button in the practice panel reopens them.

## What it uses

| Piece | Used for |
|---|---|
| Plain HTML, CSS and JavaScript (`public/index.html`) | The whole front end. No framework, no build step. |
| Chrome's **Web Speech API** | Live transcription while you practice (so use Chrome). |
| **Claude**, through the official `@anthropic-ai/sdk` | Edit suggestions on the script. Haiku 5.5 by default; Sonnet 5.5, Opus 5.5 and Fable 5.1 are selectable. |
| **Jev** by [TypeSafe AI](https://typesafe.ai) (HTTPS API) | The rubric: small semantic judgments such as "does this spoken sentence make the same point as the plan?". Numbers (word error rate, edit counts, order) are computed in code. |
| Fuzzy matching (own code) | Following your place in the script through mishearings, skipped words and jumps. |
| Node and TypeScript on [Anbaric](https://www.npmjs.com/package/anbaric) | A small server that hosts the page and calls Claude and Jev, so the keys never reach the browser. |
| `localStorage` | Your profile, sessions, recordings and rubric results stay in your browser. |

## Run it

You need Node 20 or newer and Google Chrome.

```bash
npm install
cp .env.example .env      # then put your keys in .env
./run.sh                  # serves http://localhost:3003 and opens it; Ctrl-C to stop
```

The default port is **3003** (set `PORT` to change it). Without keys the app still works: the demo scripts have saved suggestions and saved rubric results (see below). The keys are only needed to get suggestions for your own scripts and to score your own recordings.

`.env` holds:

| Variable | For |
|---|---|
| `ANTHROPIC_API_KEY` | Suggestions (Claude). |
| `JEV_API_KEY` | Rubric scores (Jev). `TYPESAFE_API_KEY` also works. |
| `SUGGEST_EFFORT` | Optional: `low` (default), `medium` or `high`. |

`.env` is ignored by git. Never commit it.

## Saved results for the demos

To save money and to work offline, results for the **demo scripts used unchanged** are saved in `public/cache/`:

- `<sampleId>.json`: Claude's suggestions for each sample script. Used only when the script text matches its saved hash.
- `rubrics.json`: Jev's rubric for each sample script scored against each of its sample speaker transcripts. Used only when script, transcript, purpose and audience are unchanged.

Edit a demo script, or press **Regenerate**, and you get a live call. Remake the saved results with:

```bash
npm run cache            # suggestions, all samples (Haiku 5.5)
npm run cache -- --only h1 --model claude-sonnet-5-5
npm run cache:rubrics    # Jev rubrics
npm run cache:all        # both
```

## Deploy to Anbaric

```bash
anbaric login
anbaric secrets set ANTHROPIC_API_KEY
anbaric secrets set JEV_API_KEY
anbaric app deploy       # later: anbaric app update
```

The page uses only relative links and `#/` routes, so it works at the app's own address and under `/app/<name>/`. The deployment config lives in `.anbaric/app-config.json`, which is not in git. Create it with `anbaric app configure` (name `preparation-app`, port `3003`).

## Project layout

```
public/index.html      the whole front end
public/cache/          saved Claude suggestions and Jev rubric results for the demo scripts
src/main.ts            HTTP server: static files, /api/suggest, /api/rubric, /api/models
src/suggest.ts         Claude prompt, response checking, model list
src/jev.ts             rubric scoring with Jev (TypeScript port of the original Python scorer)
scripts/               gen-cache.ts, gen-rubrics.ts: make the saved results
run.sh                 local launcher
archive/               earlier experiments and notes (voice-app, speech-breath, Jev docs)
.anbaric/              local deployment config (not in git)
```

## Notes and limits

- **Chrome only.** Live transcription uses Chrome's speech recognition, which needs an internet connection. If it keeps stopping, close other tabs or windows that use the microphone, and check the microphone permission for the site.
- **Not scored from text.** The rubric can't judge voice and authenticity, presence and composure, or delivery variety. Those need audio or a person.
- **Rubric values are a starting point.** Jev reads the rubric levels as written; compare its scores with human raters before relying on them.
- **Privacy.** The profile notice says recorded sessions are used to improve your suggestions. Today everything is kept in your browser; the server only passes the text it needs to Claude and Jev for each request.
- **No sign-in.** Anyone who can open a deployed copy shares its server. Put it behind Anbaric's login (the default) and don't store personal data on the server.
