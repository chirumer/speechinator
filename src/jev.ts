// Scores a recorded transcript against the planned script with Jev (TypeSafe's "System One" model).
// A TypeScript port of score_speech.py. Division of labour (as TypeSafe recommends for Jev):
//   code does everything numeric (sentence splitting, word error rate, edit counts, order, score conversion, review thresholds)
//   Jev does the small semantic judgments, one dimension per question, with descriptive levels and small state.

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-1.13.0";                    // pinned so scores stay reproducible across Jev upgrades
const CONF_AUTO = 0.80, CONF_HUMAN = 0.50;     // confidence gates; tune on your own data

type Question = {type : "score" | "choice" | "noul", instructions : string, criteria? : unknown};
type Answer = {type : string, score? : number, choice? : string, noul? : number, confidence? : number, probabilities? : Record<string, number>};
const score = (instructions : string, criteria : Array<string>) : Question => ({type: "score", instructions, criteria});
const choice = (instructions : string, criteria : Record<string, string>) : Question => ({type: "choice", instructions, criteria});
const noul = (instructions : string, criteria? : {true : string, false : string}) : Question => ({type: "noul", instructions, ...(criteria ? {criteria} : {})});

export const jevConfigured = () => !!(process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY);
const failure = (message : string, status : number, code : string) => Object.assign(new Error(message), {status, code});

let inFlight = 0;
const waiting : Array<() => void> = [];
const slot = async () => { if (inFlight >= 8) await new Promise<void>((resolve) => waiting.push(resolve)); inFlight++; };
const release = () => { inFlight--; waiting.shift()?.(); };

// One Jev call, with exponential backoff on 429 / 5xx as the API docs advise.
const ask = async (state : unknown, questions : Record<string, Question>) : Promise<Record<string, Answer>> => {
    const key = process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY;
    if (!key) throw failure("No JEV_API_KEY is configured on the server.", 503, "not-configured");
    await slot();
    try {
        for (let attempt = 0; ; attempt++) {
            const response = await fetch(ENDPOINT, {
                method: "POST", headers: {"content-type": "application/json", authorization: `Bearer ${key}`},
                body: JSON.stringify({state, model: MODEL, questions}), signal: AbortSignal.timeout(30_000),
            }).catch((error) => { throw failure(`Couldn't reach Jev: ${error.message}`, 502, "upstream"); });
            if (response.ok) return ((await response.json()) as any).answers;
            if ((response.status === 429 || response.status >= 500) && attempt < 3) { await new Promise((r) => setTimeout(r, 400 * 2 ** attempt + Math.random() * 200)); continue; }
            if (response.status === 401 || response.status === 403) throw failure("The server's Jev key was rejected.", 502, "auth");
            throw failure(`Jev answered ${response.status}.`, 502, "upstream");
        }
    } finally { release(); }
};

// ---------------------------------------------------------------------------------- text utilities

const MARKER = /\[(?:pause|demo|start demo|breathe)[^\]]*\]/gi;
const PLACEHOLDER = /\[[^\]]+\]/g;

export const clean = (text : string) => {
    text = text.replace(/^\s*>\s?/gm, "").replace(/\*\*/g, "").replace(MARKER, " ");
    const placeholders = text.match(PLACEHOLDER) ?? [];
    text = text.replace(PLACEHOLDER, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
    return {text: text.trim(), placeholders};
};

// Split on punctuation/newlines; chunk very long runs (speech-to-text often has no punctuation); merge tiny fragments into the next sentence.
export const splitSentences = (text : string, maxWords = 35, chunk = 20, minWords = 3) => {
    const parts : Array<string> = [];
    for (let part of text.split(/(?<=[.!?])\s+|\n+/)) {
        part = part.trim();
        if (!part) continue;
        const w = part.split(/\s+/);
        if (w.length > maxWords) for (let i = 0; i < w.length; i += chunk) parts.push(w.slice(i, i + chunk).join(" "));
        else parts.push(part);
    }
    const merged : Array<string> = [];
    let carry = "";
    for (let s of parts) {
        if (carry) { s = `${carry} ${s}`.trim(); carry = ""; }
        if (s.split(/\s+/).length < minWords) carry = s; else merged.push(s);
    }
    if (carry) { if (merged.length) merged[merged.length - 1] += " " + carry; else merged.push(carry); }
    return merged;
};

const words = (text : string) => text.toLowerCase().match(/[a-z0-9']+/g) ?? [];

// Word-level edit distance, with substitutions / deletions / insertions counted along one optimal alignment.
const editOps = (a : Array<string>, b : Array<string>) => {
    const d : Array<Array<number>> = Array.from({length: a.length + 1}, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    let i = a.length, j = b.length, sub = 0, del = 0, ins = 0;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { if (a[i - 1] !== b[j - 1]) sub++; i--; j--; }
        else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { del++; i--; }
        else { ins++; j--; }
    }
    return {distance: d[a.length][b.length], sub, del, ins};
};

const lcs = (a : Array<string>, b : Array<string>) => {
    let prev = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) { const cur = [0]; for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; }
    return prev[b.length];
};
const similarity = (a : Array<string>, b : Array<string>) => {
    if (!a.length || !b.length) return 0;
    const lex = 2 * lcs(a, b) / (a.length + b.length), sa = new Set(a), sb = new Set(b);
    const both = [...sa].filter((x) => sb.has(x)).length;
    return 0.5 * lex + 0.5 * both / new Set([...sa, ...sb]).size;
};

// Shortlist target sentences for source sentence i: closest by wording plus closest by position (paraphrases score low on wording, position keeps them in).
const pickCandidates = (i : number, src : Array<Array<string>>, tgt : Array<Array<string>>, kLex = 2, kPos = 2) => {
    const rel = i / Math.max(src.length - 1, 1), idx = tgt.map((_, j) => j);
    const byLex = [...idx].sort((x, y) => similarity(src[i], tgt[y]) - similarity(src[i], tgt[x])).slice(0, kLex);
    const byPos = [...idx].sort((x, y) => Math.abs(x / Math.max(tgt.length - 1, 1) - rel) - Math.abs(y / Math.max(tgt.length - 1, 1) - rel)).slice(0, kPos);
    return [...new Set([...byLex, ...byPos])].sort((x, y) => x - y);
};
const reviewFlag = (conf : number) => conf >= CONF_AUTO ? "auto" : conf >= CONF_HUMAN ? "check" : "human";
const round = (x : number, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

// ---------------------------------------------------------------------------------- Core Rubric
// Levels describe situations, not degrees. Three levels = the rubric's anchors for 1, 3 and 5; Jev's 0..2 score maps to 1..5 as 1 + 2 * score.

const OPENING = ["Starts with filler, an apology, or a bare greeting and gives the listener no reason to keep listening",
    "Starts clearly by saying who is speaking or what the talk is about, but nothing draws the listener in",
    "Opens with a question, a story, a surprising fact, or a stake that gives the listener a reason to keep listening"];
const ENDING = ["Trails off or ends with a filler close such as 'that's it, thanks' and gives no next step",
    "Ends with a clear stop and thanks, but nothing memorable and no next step",
    "Ends with a memorable line or a specific next step the listener can act on"];
const CLARITY = ["A listener could not state the main point in one sentence",
    "A listener could state the main point, but would have to piece it together from several parts",
    "The main point is stated plainly and reinforced, so a listener could repeat it in one sentence"];
const STRUCTURE = ["Ideas come in no clear order and the speaker jumps between topics without transitions",
    "Ideas follow an order, but some transitions are missing or abrupt",
    "Each part leads to the next with clear transitions, such as an outline up front or signposts like 'first' and 'next'"];
const SUBSTANCE = ["Claims are made without any numbers, examples, or results",
    "Some claims have a number, example, or result and others have none",
    "Most claims are backed by a specific number, example, or result"];
const PERSUASION = ["States claims with no reasons, or undercuts its own claims",
    "Gives some reasons, but weakens them with hedges such as 'maybe', 'I guess', or 'we think'",
    "Gives clear reasons and states its claims plainly, without hedging"];
const AUDIENCE = ["Uses jargon, idioms, or a level of detail that the audience would not follow",
    "Mostly suits the audience, with a few phrases or details that would lose some listeners",
    "Vocabulary, level of detail, and tone suit the audience throughout"];
const WARMTH = ["Talks only about the topic, with no reference to the listener and nothing personal",
    "Includes a few direct addresses to the listener or personal touches",
    "Speaks to the listener directly more than once and includes a personal or human element, such as a story or thanks, that makes the listener feel included"];
const RECOVERY = ["After the stumble the speaker abandons the sentence or the point and moves on without finishing it",
    "The speaker finishes the point but needs several more restarts or repairs to do it",
    "The speaker repairs the stumble in a few words and continues the point in order"];

export const CORE_LABELS : Record<string, string> = {
    opening: "Opening", message_clarity: "Message clarity", structure_flow: "Structure and flow", substance_evidence: "Substance and evidence",
    persuasiveness: "Persuasiveness", audience_fit: "Audience fit", warmth_connection: "Warmth and connection", ending: "Ending", recovery: "Recovery (provisional)",
};
export const NOT_SCORED : Record<string, string> = {
    "Voice and authenticity": "needs audio or a human: text cannot show whether it sounded read or spoken",
    "Presence and composure": "needs audio or video, or a human",
    "Delivery variety": "needs audio features (pitch, volume, pauses), or a human",
};

const coreRequests = (transcript : string, purpose : string, audience : string) => {
    const sents = splitSentences(transcript);
    return [
        [{speech_purpose: purpose, audience, opening: sents.slice(0, 3).join(" ")},
            {opening: score("How well does `opening` earn the listener's attention? Judge only `opening`.", OPENING)}],
        [{speech_purpose: purpose, closing: sents.slice(-3).join(" ")},
            {ending: score("How well does `closing` end the speech? Judge only `closing`.", ENDING)}],
        [{speech_purpose: purpose, audience, transcript}, {
            message_clarity: score("How clearly does `transcript` state its main point?", CLARITY),
            structure_flow: score("How well do the parts of `transcript` follow one another?", STRUCTURE),
            substance_evidence: score("How many of the claims in `transcript` are backed by a specific number, example, or result?", SUBSTANCE),
            persuasiveness: score("How strongly does `transcript` give reasons to accept its main claim?", PERSUASION),
            audience_fit: score("How well do the vocabulary, level of detail, and tone of `transcript` suit `audience`?", AUDIENCE),
            warmth_connection: score("How much does `transcript` speak to the listener and include personal or human elements?", WARMTH),
            has_stumble: noul("Does `transcript` contain a restart, a repeated phrase, or a self-correction?", {
                true: "A sentence is restarted, a phrase is said twice in a row, or the speaker corrects themselves (for example 'I mean' or 'sorry')",
                false: "No restarts, repeats, or corrections. Plain filler words such as 'um' do not count"}),
            recovery: score("After a restart, repeated phrase, or self-correction in `transcript`, how does the speech continue?", RECOVERY),
        }],
    ] as Array<[unknown, Record<string, Question>]>;
};

const runCore = async (transcript : string, purpose : string, audience : string) => {
    const responses = await Promise.all(coreRequests(transcript, purpose, audience).map(([state, questions]) => ask(state, questions)));
    const answers : Record<string, Answer> = Object.assign({}, ...responses);
    const out : Record<string, any> = {};
    for (const key of Object.keys(CORE_LABELS)) {
        if (key === "recovery" && (answers.has_stumble.noul ?? 0) < 0.5) { out[key] = {rating: null, note: "n/a: no restart or self-correction detected", stumbleProbability: round(answers.has_stumble.noul ?? 0)}; continue; }
        const a = answers[key], rating = round(1 + 2 * (a.score ?? 0));
        out[key] = {rating, confidence: round(a.confidence ?? 0), review: reviewFlag(a.confidence ?? 0), needsComment: rating <= 1.5 || rating >= 4.5,
            probabilities: Object.fromEntries(Object.entries(a.probabilities ?? {}).map(([k, v]) => [k, round(v)]))};
    }
    return out;
};

// ---------------------------------------------------------------------------------- Alignment (plan vs spoken)

const NONE_TEXT = "No option makes the same point";
const PRESERVED = ["The spoken sentence changes or contradicts the point of the planned sentence",
    "The spoken sentence keeps the point but drops or changes a specific detail, such as a number, name, claim, or step",
    "The spoken sentence keeps the point and its details, in the same or different words"];
const INSERT_OPTIONS : Record<string, string> = {
    new_content: "Adds a new fact, claim, example, or story",
    filler_or_hedge: "Adds no information: filler such as 'um' or 'so basically', or a hedge such as 'I think' or 'maybe'",
    restart_or_correction: "Repeats, restarts, or corrects something said earlier",
    other: "Something else, such as a greeting or an aside to the audience",
};

const runAlignment = async (planText : string, actualText : string) => {
    const P = splitSentences(planText), S = splitSentences(actualText), Pw = P.map(words), Sw = S.map(words);

    // Stage 1a: for each planned sentence, which spoken sentence (if any) makes the same point? Asked twice with the options in opposite order (Jev can lean to the first option).
    const matches = await Promise.all(P.map(async (planned, i) => {
        const cand = pickCandidates(i, Pw, Sw), fwd : Record<string, string> = {};
        for (const j of cand) fwd[`s${j}`] = S[j];
        const rev = Object.fromEntries(Object.entries(fwd).reverse());
        const q = "Which option says the same thing as `planned_sentence`? Choose `none` if no option makes the same point.";
        const r = await ask({planned_sentence: planned}, {fwd: choice(q, {...fwd, none: NONE_TEXT}), rev: choice(q, {...rev, none: NONE_TEXT})});
        const f = r.fwd, v = r.rev, best = (f.confidence ?? 0) >= (v.confidence ?? 0) ? f : v, j = best.choice === "none" ? null : Number((best.choice as string).slice(1));
        return {plannedIdx: i, planned, spokenIdx: j as number | null, spoken: j === null ? null : S[j], confidence: round(best.confidence ?? 0), stable: f.choice === v.choice,
            preservedScore: null as number | null, preservedConfidence: null as number | null, status: "", review: ""};
    }));

    // Stage 1b: how well was the point kept? (matched pairs only)
    const matched = matches.filter((m) => m.spokenIdx !== null);
    await Promise.all(matched.map(async (m) => {
        const a = (await ask({planned_sentence: m.planned, spoken_sentence: m.spoken}, {preserved: score("How much of `planned_sentence` does `spoken_sentence` keep?", PRESERVED)})).preserved;
        m.preservedScore = round(a.score ?? 0); m.preservedConfidence = round(a.confidence ?? 0);
    }));

    // Stage 2: spoken sentences nobody claimed: restated plan content, or an insertion?
    const claimed = new Set(matched.map((m) => m.spokenIdx)), unclaimed = S.map((_, j) => j).filter((j) => !claimed.has(j));
    const classified = await Promise.all(unclaimed.map(async (j) => {
        const cand = pickCandidates(j, Sw, Pw);
        const r = await ask({spoken_sentence: S[j], planned_sentences: Object.fromEntries(cand.map((i) => [`p${i}`, P[i]]))}, {
            restates_plan: noul("Does `spoken_sentence` make the same point as any item in `planned_sentences`?"),
            insertion_type: choice("What does `spoken_sentence` add to the speech?", INSERT_OPTIONS)});
        const restates = r.restates_plan.noul ?? 0, t = r.insertion_type;
        return {spokenIdx: j, spoken: S[j], restatesPlan: round(restates), type: restates > 0.7 ? "restates_plan" : (t.choice as string), confidence: round(t.confidence ?? 0)};
    }));
    const insertions = classified.filter((u) => u.type !== "restates_plan");

    // Numbers computed in code
    const pw = Pw.flat(), sw = Sw.flat(), ops = editOps(pw, sw), wer = ops.distance / Math.max(pw.length, 1);
    const pairs = matched.map((m) => [m.plannedIdx, m.spokenIdx as number]);
    let conc = 0, disc = 0;
    for (let a = 0; a < pairs.length; a++) for (let b = a + 1; b < pairs.length; b++) { const d = pairs[b][1] - pairs[a][1]; if (d > 0) conc++; else if (d < 0) disc++; }
    const order = conc + disc === 0 ? null : round(((conc - disc) / (conc + disc) + 1) / 2, 3);
    const pres = matched.map((m) => (m.preservedScore ?? 0) / 2);
    for (const m of matches) {
        m.status = m.spokenIdx === null ? "omitted" : (m.preservedScore ?? 0) < 0.75 ? "drift" : (m.preservedScore ?? 0) < 1.5 ? "detail_changed" : "faithful";
        m.review = !m.stable || m.confidence < CONF_HUMAN ? "human" : reviewFlag(m.confidence);
    }
    return {
        metrics: {
            coverage: round(matched.length / Math.max(P.length, 1), 3), meaningFidelity: pres.length ? round(pres.reduce((a, b) => a + b, 0) / pres.length, 3) : null,
            wordingFidelity: round(Math.max(0, 1 - wer), 3), wordErrorRate: round(wer, 3), wordEdits: {substituted: ops.sub, deleted: ops.del, inserted: ops.ins}, orderFidelity: order,
            plannedSentences: P.length, spokenSentences: S.length, omitted: matches.filter((m) => m.status === "omitted").length, drifted: matches.filter((m) => m.status === "drift").length,
            detailChanged: matches.filter((m) => m.status === "detail_changed").length, insertions: insertions.length, itemsNeedingHumanReview: matches.filter((m) => m.review === "human").length},
        items: matches, insertions,
    };
};

export type RubricInput = {planned : string, actual : string, purpose : string, audience : string};

export const scoreSpeech = async ({planned, actual, purpose, audience} : RubricInput) => {
    const plan = clean(planned), spoken = clean(actual);
    if (!plan.text || !spoken.text) throw failure("Both the script and the transcript need some text.", 400, "bad-request");
    const [coreActual, corePlan, alignment] = await Promise.all([runCore(spoken.text, purpose, audience), runCore(plan.text, purpose, audience), runAlignment(plan.text, spoken.text)]);
    const rated = Object.values(coreActual).map((x : any) => x.rating).filter((x) : x is number => typeof x === "number");
    return {model: MODEL, purpose, audience, unfilledPlaceholders: plan.placeholders, labels: CORE_LABELS, notScored: NOT_SCORED,
        overall: rated.length ? round(rated.reduce((a, b) => a + b, 0) / rated.length) : null, core: {actual: coreActual, plan: corePlan}, alignment};
};
