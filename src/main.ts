import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {suggest, isModel, DEFAULT_MODEL, MODELS} from "./suggest.js";
import {scoreSpeech, jevConfigured} from "./jev.js";

// Local development: load ANTHROPIC_API_KEY (and friends) from .env here or one folder up. Never logged, never uploaded (the parent folder is outside the app).
for (const file of [new URL("../.env", import.meta.url), new URL("../../.env", import.meta.url)]) {
    try {
        for (const line of readFileSync(file, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
            if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
        }
    } catch {}
}

// Serves the static front end in ../public. Deployed on Anbaric it is reached at /app/<name>/ or at its own
// address, so the page only uses relative links.
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
};

const readBody = (request : import("node:http").IncomingMessage, limit = 400_000) : Promise<string> => new Promise((resolve, reject) => {
    const chunks : Array<Buffer> = []; let size = 0;
    request.on("data", (chunk : Buffer) => { size += chunk.length; if (size > limit) { reject(Object.assign(new Error("Too large."), {status: 413})); request.destroy(); } else chunks.push(chunk); });
    request.on("end", () => resolve(Buffer.concat(chunks).toString()));
    request.on("error", reject);
});
// Same hash as the page and scripts/gen-cache.ts (FNV-1a)
const textHash = (t : string) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0") + t.length.toString(16); };
const rubricKey = (planned : string, actual : string, purpose : string, audience : string) => textHash([planned, actual, purpose, audience].join("\u0000"));
// Jev results for the demo scripts, saved by `npm run cache`. A demo script scored with a demo transcript, unchanged, never calls Jev.
const rubrics = new Map<string, unknown>();
try { for (const [key, entry] of Object.entries(JSON.parse(readFileSync(publicDir + "cache/rubrics.json", "utf8")).entries ?? {})) rubrics.set(key, (entry as any).result); } catch {}
const answers = new Map<string, unknown>();       // repeat requests for the same script and context are answered without calling the model again
const sendJson = (response : import("node:http").ServerResponse, status : number, body : unknown) => { response.writeHead(status, {"content-type": "application/json"}); response.end(JSON.stringify(body)); };

createServer(async (request, response) => {
    try {
        if (request.method === "GET" && new URL(request.url ?? "/", "http://localhost").pathname.replace(/\/+$/, "") === "/api/models") return sendJson(response, 200, {default: DEFAULT_MODEL, models: MODELS, configured: !!process.env.ANTHROPIC_API_KEY, jev: jevConfigured()});
        if (request.method === "POST" && new URL(request.url ?? "/", "http://localhost").pathname.replace(/\/+$/, "") === "/api/rubric") {
            try {
                const {planned, actual, purpose, audience} = JSON.parse(await readBody(request) || "{}");
                if (typeof planned !== "string" || typeof actual !== "string" || !planned.trim() || !actual.trim() || planned.length > 30_000 || actual.length > 30_000)
                    return sendJson(response, 400, {error: "bad-request", message: "planned and actual text are required (up to 30,000 characters each)"});
                const p = typeof purpose === "string" ? purpose : "", a = typeof audience === "string" ? audience : "", key = rubricKey(planned, actual, p, a);
                const cached = rubrics.has(key);
                if (!cached) { rubrics.set(key, await scoreSpeech({planned, actual, purpose: p, audience: a})); if (rubrics.size > 300) rubrics.delete(rubrics.keys().next().value!); }
                return sendJson(response, 200, {...(rubrics.get(key) as object), cached, key});
            } catch (error : any) {
                console.error("rubric failed:", error?.message);
                return sendJson(response, error?.status ?? 500, {error: error?.code ?? "failed", message: error?.message ?? "Something went wrong."});
            }
        }
        if (request.method === "POST" && new URL(request.url ?? "/", "http://localhost").pathname.replace(/\/+$/, "") === "/api/suggest") {
            try {
                const {text, profile, session, model} = JSON.parse(await readBody(request) || "{}");
                if (typeof text !== "string" || !text.trim()) return sendJson(response, 400, {error: "bad-request", message: "text is required"});
                const chosen = isModel(model) ? model : DEFAULT_MODEL;
                const key = createHash("sha256").update(JSON.stringify([chosen, text, profile, session])).digest("hex");
                if (!answers.has(key)) { answers.set(key, await suggest(text, {profile, session}, chosen)); if (answers.size > 100) answers.delete(answers.keys().next().value!); }
                return sendJson(response, 200, {...(answers.get(key) as object), model: chosen});
            } catch (error : any) {
                console.error("suggest failed:", error?.message);
                return sendJson(response, error?.status ?? 500, {error: error?.code ?? "failed", message: error?.message ?? "Something went wrong."});
            }
        }
        const {pathname} = new URL(request.url ?? "/", "http://localhost");
        const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
        const file = join(publicDir, relative.endsWith("/") || relative === "." ? "index.html" : relative);
        if (!file.startsWith(publicDir)) { response.writeHead(403).end("forbidden"); return; }
        const body = await readFile(file);
        response.writeHead(200, {"content-type": types[extname(file)] ?? "application/octet-stream"});
        response.end(body);
    } catch {
        response.writeHead(404, {"content-type": "text/plain"}).end("not found");
    }
}).listen(Number(process.env.PORT ?? 3003), () => console.log("preparation-app listening"));
