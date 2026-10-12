import {createServer, IncomingMessage, ServerResponse} from "node:http";
import {readFile} from "node:fs/promises";
import {Code, JobPersistenceFactory, QueueFactory, serializeJob, SystemActor} from "anbaric";
import {sessionsMachine} from "./machine.js";

const persistence = JobPersistenceFactory.instance();
const queue = QueueFactory.instance();
const sessions = sessionsMachine(persistence, queue);
const browserActor = new Code("browser");

const pageUrl = new URL("../public/index.html", import.meta.url);

const readJson = (request : IncomingMessage) : Promise<any> =>
    new Promise((resolve, reject) => {
        const chunks : Array<Buffer> = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("error", reject);
        request.on("end", () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")); }
            catch (error) { reject(error); }
        });
    });

const json = (response : ServerResponse, status : number, body : unknown) => {
    response.writeHead(status, {"content-type": "application/json"});
    response.end(JSON.stringify(body));
};

const handle = async (request : IncomingMessage, response : ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "GET" && path === "/") {
        response.writeHead(200, {"content-type": "text/html; charset=utf-8"});
        return response.end(await readFile(pageUrl));
    }

    if (request.method === "POST" && path === "/api/sessions") {
        const {title, mode, projectId} = await readJson(request);
        const start = new Map<string, any>([["title", title], ["mode", mode], ["startedAt", Date.now()]]);
        if (typeof projectId === "string") start.set("projectId", projectId);
        const job = await sessions.startJob(start, browserActor);
        return json(response, 201, {id: job.id});
    }

    // Mock summarizer: stands in for a real analysis service. Takes a transcript, answers with JSON.
    if (request.method === "POST" && path === "/api/summarize") {
        const {transcript} = await readJson(request);
        if (typeof transcript !== "string") return json(response, 400, {error: "transcript is required"});
        return json(response, 200, {summary: "Exceptional speech", suggestions: []});
    }

    const finish = path.match(/^\/api\/sessions\/([^/]+)\/finish$/);
    if (request.method === "POST" && finish) {
        const {words, chimes, stamps, transcript} = await readJson(request);
        const end = new Map<string, any>([["endedAt", Date.now()], ["words", words], ["chimes", chimes], ["stamps", stamps]]);
        if (typeof transcript === "string") end.set("transcript", transcript);   // the recorded transcript is stored with the session
        await sessions.updateJob(finish[1], end, browserActor);
        return json(response, 202, {id: finish[1]});
    }

    const one = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (request.method === "GET" && one) {
        return json(response, 200, serializeJob(await persistence.retrieve(one[1], SystemActor.actor)));
    }

    if (request.method === "GET" && path === "/api/sessions") {
        return json(response, 200, (await persistence.list(browserActor)).map(serializeJob));
    }

    response.writeHead(404).end("not found");
};

createServer((request, response) => {
    handle(request, response).catch((error) => json(response, 500, {error: error instanceof Error ? error.message : "Internal error"}));
}).listen(Number(process.env.PORT ?? 3000), () => console.log("voice-app listening"));
