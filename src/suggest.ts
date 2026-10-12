import Anthropic from "@anthropic-ai/sdk";

// LLM edit suggestions for a speech script.
// buildPrompt / parseSuggestions are shared by the server and by scripts/gen-cache.ts (which makes the saved demo responses).

export type Suggestion = {type : string, original : string, replacement : string, reason : string};
export type SuggestionResult = {summary : string, suggestions : Array<Suggestion>};
export type Context = {profile? : unknown, session? : unknown};

export const SYSTEM = `You are a speech coach who edits scripts line by line. You propose small, concrete edits that the speaker can accept or reject one at a time.

Return ONLY a JSON object, with no prose and no code fences, shaped exactly like:
{"summary": "<one or two sentences on the biggest opportunities>", "suggestions": [{"type": "<filler|clarity|wording|idiom|tone|structure|length>", "original": "<exact text from the script>", "replacement": "<new text, or an empty string to delete>", "reason": "<at most 18 words>"}]}

Rules:
- "original" must be an exact, contiguous substring of the script, copied character for character (including punctuation and curly quotes), and it must appear only once. Add a few neighbouring words if needed to make it unique.
- Keep each edit small: a word, phrase or sentence, never a whole paragraph. Edits must not overlap.
- Give 8 to 14 suggestions, ordered as they appear in the script.
- Never change or remove the speaker's preferred words.
- Use the speaker's profile: where they struggle with certain sounds or words, offer easy alternatives that avoid them (respect their avoidance level); use their English variety; use plain, literal language if they prefer it; if the audience is international or mixed, replace idioms and region-specific phrases; remove filler words and hedging; keep the tone they asked for.
- Respect the time limit. Assume 130 spoken words per minute and suggest cuts if the script is over.
- Keep the speaker's voice and meaning. If the profile asks for gentle feedback, phrase reasons kindly.`;

export const buildPrompt = (text : string, ctx : Context) =>
    `Speaker profile and session details (JSON):\n${JSON.stringify({profile: ctx.profile ?? {}, session: ctx.session ?? {}}, null, 1)}\n\nScript:\n<script>\n${text}\n</script>\n\nReturn the JSON now.`;

const str = (value : unknown) => typeof value === "string" ? value : "";

// Pulls the JSON out of a model reply and keeps only suggestions whose "original" really is in the text exactly once.
export const parseSuggestions = (raw : string, text : string) : SuggestionResult => {
    const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("The model did not return JSON.");
    const body = JSON.parse(raw.slice(start, end + 1));
    const found : Array<Suggestion & {at : number}> = [];
    for (const item of Array.isArray(body.suggestions) ? body.suggestions : []) {
        const original = str(item?.original), replacement = str(item?.replacement);
        if (!original || original === replacement) continue;
        const at = text.indexOf(original);
        if (at < 0 || text.indexOf(original, at + 1) >= 0) continue;
        found.push({type: str(item.type) || "clarity", original, replacement, reason: str(item.reason).slice(0, 200), at});
    }
    found.sort((a, b) => a.at - b.at);
    const kept : Array<Suggestion> = [];
    let edge = -1;
    for (const f of found) {                      // drop overlaps, keeping the earlier edit
        if (f.at < edge) continue;
        edge = f.at + f.original.length;
        kept.push({type: f.type, original: f.original, replacement: f.replacement, reason: f.reason});
    }
    return {summary: str(body.summary).slice(0, 400), suggestions: kept};
};

// The models the app lets you pick. Haiku is the default because it is by far the cheapest ($ per million tokens, input / output).
export const MODELS : Array<{id : string, label : string, price : string}> = [
    {id: "claude-haiku-5-5", label: "Haiku 5.5", price: "$0.10 / $0.50"},
    {id: "claude-sonnet-5-5", label: "Sonnet 5.5", price: "$2 / $10"},
    {id: "claude-opus-5-5", label: "Opus 5.5", price: "$4 / $20"},
    {id: "claude-fable-5-1", label: "Fable 5.1", price: "$10 / $50"},
];
export const DEFAULT_MODEL = MODELS[0].id;
export const isModel = (id : unknown) : id is string => typeof id === "string" && MODELS.some((m) => m.id === id);

const failure = (message : string, status : number, code : string) => Object.assign(new Error(message), {status, code});

// Calls Claude through the official SDK. The key is read from ANTHROPIC_API_KEY (locally from ../.env; on Anbaric: `anbaric secrets set ANTHROPIC_API_KEY`).
// Thinking is left at each model's default, with effort kept low to save tokens.
export const suggest = async (text : string, ctx : Context, model : string = DEFAULT_MODEL) : Promise<SuggestionResult> => {
    if (!process.env.ANTHROPIC_API_KEY) throw failure("No ANTHROPIC_API_KEY is configured on the server.", 503, "not-configured");
    const client = new Anthropic();
    try {
        const response = await client.messages.create({
            model,
            max_tokens: 6000,
            system: SYSTEM,
            output_config: {effort: (process.env.SUGGEST_EFFORT as "low" | "medium" | "high") ?? "low"},
            messages: [{role: "user", content: buildPrompt(text, ctx)}],
        });
        if (response.stop_reason === "refusal") throw failure("The model declined to edit this script.", 422, "refused");
        if (response.stop_reason === "max_tokens") throw failure("The reply was cut off. Try a shorter script or another model.", 502, "truncated");
        const reply = response.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("");
        return parseSuggestions(reply, text);
    } catch (error) {
        if ((error as any)?.code) throw error;
        if (error instanceof Anthropic.AuthenticationError) throw failure("The server's Anthropic API key was rejected.", 502, "auth");
        if (error instanceof Anthropic.RateLimitError) throw failure("The model service is busy. Try again in a moment.", 429, "rate-limited");
        if (error instanceof Anthropic.APIError) throw failure(`The model service answered ${error.status}.`, 502, "upstream");
        throw failure((error as Error).message || "The request failed.", 502, "failed");
    }
};
