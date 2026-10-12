import {Action, Code, JobPersistence, PropertyDefinition, Queue, State, StateMachine, Transition} from "anbaric";

const isNonNegativeNumber = (value : unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

const definition = (name : string, validation : (value : any) => boolean, required = false) => {
    const property = new PropertyDefinition(name);
    property.required = required;
    property.validation = validation;
    return property;
};

const properties = [
    definition("title", (value) => typeof value === "string" && value.length > 0, true),
    definition("mode", (value) => value === "guided" || value === "free"),
    definition("projectId", (value) => typeof value === "string"),
    definition("transcript", (value) => typeof value === "string"),
    definition("startedAt", isNonNegativeNumber, true),
    definition("endedAt", isNonNegativeNumber),
    definition("words", isNonNegativeNumber),
    definition("chimes", isNonNegativeNumber),
    definition("stamps", isNonNegativeNumber),
    definition("durationSec", isNonNegativeNumber),
    definition("wordsPerMinute", isNonNegativeNumber),
    definition("pace", (value) => ["slow", "steady", "fast"].includes(value)),
];

const scoreSession = new Action("Score the session", new Code("session-scorer"),
    "Works out speaking duration, words per minute and pace once a session has ended");
scoreSession.run = async (job) => {
    const startedAt = await job.properties.get("startedAt") as number;
    const endedAt = await job.properties.get("endedAt") as number;
    const words = (await job.properties.has("words")) ? await job.properties.get("words") as number : 0;
    const durationSec = Math.max(1, Math.round((endedAt - startedAt) / 1000));
    const wordsPerMinute = Math.round(words / (durationSec / 60));
    const pace = wordsPerMinute < 110 ? "slow" : wordsPerMinute > 160 ? "fast" : "steady";
    return new Map<string, any>([["durationSec", durationSec], ["wordsPerMinute", wordsPerMinute], ["pace", pace]]);
};

export const sessionsMachine = (persistence : JobPersistence, queue : Queue) => new StateMachine(
    "sessions",
    [
        new State("recording", [], [new Transition("scoring", async (job) => await job.properties.has("endedAt"))]),
        new State("scoring", [scoreSession], [new Transition("completed", async (job) => await job.properties.has("pace"))]),
        new State("completed"),
    ],
    "recording",
    properties,
    persistence,
    queue,
);
