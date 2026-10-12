// Saves Jev rubric results for the demo scripts: public/cache/rubrics.json
//   npm run cache:rubrics
// Each demo script is scored against each of its sample speaker transcripts, using the demo's own purpose and audience.
// The page and the server look results up by a hash of (script, transcript, purpose, audience), so a demo script used unchanged never calls Jev.
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {scoreSpeech} from "../src/jev.js";

for (const file of [new URL("../../.env", import.meta.url), new URL("../.env", import.meta.url)]) {
    try { for (const line of readFileSync(file, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); } } catch {}
}
const textHash = (t : string) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0") + t.length.toString(16); };
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const between = (from : string, to : string) => html.slice(html.indexOf(from) + from.length, html.indexOf(to, html.indexOf(from)));
const samples : Array<any> = new Function("return " + between("const SAMPLES = ", "];\n/* Sample speaker transcripts") + "]")();
const speakers : Record<string, Array<any>> = new Function("return " + between("const SPEAKER_SAMPLES = ", "};\n$('tray')") + "}")();

const entries : Record<string, unknown> = {};
for (const s of samples) for (const t of speakers[s.id] ?? []) {
    process.stdout.write(`${s.id} × ${t.id} … `);
    const result = await scoreSpeech({planned: s.text, actual: t.text, purpose: s.f.purpose, audience: s.f.audience});
    entries[textHash([s.text, t.text, s.f.purpose, s.f.audience].join("\u0000"))] = {sampleId: s.id, transcriptId: t.id, label: t.label, result: {...result, cached: true}};
    console.log("overall", result.overall);
}
mkdirSync(new URL("../public/cache/", import.meta.url), {recursive: true});
writeFileSync(new URL("../public/cache/rubrics.json", import.meta.url), JSON.stringify({version: 1, model: "jev-1.13.0", generatedAt: new Date().toISOString(), entries}, null, 1) + "\n");
console.log("saved", Object.keys(entries).length, "results");
