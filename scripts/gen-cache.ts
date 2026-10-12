// Makes the saved LLM responses for the demo (sample) scripts: public/cache/<sampleId>.json
//   npm run cache                       all samples, cheapest model
//   npm run cache -- --only h1          one sample
//   npm run cache -- --model claude-sonnet-5-5
// The app serves these when a sample script is used unchanged (the text hash must match), so the demo works without calling the model.
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {suggest, DEFAULT_MODEL, isModel} from "../src/suggest.js";

for (const file of [new URL("../../.env", import.meta.url), new URL("../.env", import.meta.url)]) {
    try { for (const line of readFileSync(file, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); } } catch {}
}
const args = process.argv.slice(2), arg = (name : string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const model = arg("--model") ?? DEFAULT_MODEL, only = arg("--only");
if (!isModel(model)) throw new Error("Unknown model " + model);

// same hash as the page (FNV-1a)
const hash = (t : string) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0") + t.length.toString(16); };

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const between = (from : string, to : string) => html.slice(html.indexOf(from) + from.length, html.indexOf(to, html.indexOf(from)));
const samples : Array<any> = new Function("return " + between("const SAMPLES = ", "];\n/* Sample speaker transcripts") + "]")();
const prefill : any = new Function("return " + between("const PREFILL = ", "\nlet P = ").replace(/;\s*$/, ""))();

// the demo user's profile, in the same shape the page sends (detailsJSON(false).profile)
const list = (t : string) => t.split(",").map((x) => x.trim()).filter(Boolean);
const profile = {
    voice: {speechPatterns: prefill.q1, otherPattern: "", avoidance: Object.fromEntries(Object.entries(prefill.q2).filter(([k]) => prefill.q1.includes(k))), stumbleWords: list(prefill.q3), preferredWords: list(prefill.q4)},
    language: {firstLanguage: prefill.q5, otherLanguages: prefill.q6.map((r : any) => ({language: r.lang, comfortOutOf5: r.level})), englishVariety: prefill.q7, flagRegionalPhrases: prefill.q8},
    style: {natural: prefill.q9, badNews: prefill.q10, adjustFormality: prefill.q11, idioms: prefill.q12},
    delivery: {habits: prefill.q13, improveRanking: prefill.q14, nervousnessOutOf5: prefill.q15},
    accessibility: {liveFeedback: prefill.q16, accommodations: prefill.q17, accommodationsOther: "", needsNote: prefill.q18},
    consent: {learnFromSessions: prefill.q19, storage: prefill.q20},
};

mkdirSync(new URL("../public/cache/", import.meta.url), {recursive: true});
for (const s of samples) {
    if (only && s.id !== only) continue;
    const session = {purpose: s.f.purpose, timeLimitMinutes: s.f.minutes, audience: s.f.audience, audienceRegion: s.f.region, priorities: s.f.priorities};
    process.stdout.write(`${s.id} ${s.title} … `);
    const result = await suggest(s.text, {profile, session}, model);
    writeFileSync(new URL(`../public/cache/${s.id}.json`, import.meta.url), JSON.stringify({sampleId: s.id, textHash: hash(s.text), model, generatedAt: new Date().toISOString(), ...result}, null, 2) + "\n");
    console.log(`${result.suggestions.length} suggestions`);
}
