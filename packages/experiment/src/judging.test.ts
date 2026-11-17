import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { lastJsonObject } from "./judge";
import { freezeExperiment, type Lock } from "./lock";
import { runExperiment } from "./runner";
import { hostSandbox } from "./sandbox";
import { type Experiment, loadExperiment } from "./spec";
import { readAttempts, readJudgments, storeOf } from "./store";
import { writeSampleExperiment } from "./testing/sample";

const contentJudge = `
const text = await Bun.stdin.text();
const request = JSON.parse(text);
await Bun.write("judge-requests/" + crypto.randomUUID() + ".json", text);
const right = request.entries.filter((entry) => entry.files["answer.txt"] === "right").map((entry) => entry.label);
if (request.mode === "rubric") {
  console.log("The entry is checked. " + JSON.stringify({ pass: right.length === 1 }));
} else {
  console.log(JSON.stringify({ winner: right.length === 1 ? right[0] : "tie" }));
}
`;
const firstEntryJudge = 'console.log(JSON.stringify({ winner: "A" }));';
const brokenJudge = "process.exit(4);";

async function frozen(spec: Record<string, unknown>): Promise<{
  readonly experiment: Experiment;
  readonly lock: Lock;
}> {
  const directory = await writeSampleExperiment({
    tasks: ["a", "b"],
    spec: { repeats: 1, ...spec },
  });

  await Bun.write(path.join(directory, "content-judge.ts"), contentJudge);
  await Bun.write(path.join(directory, "first-entry-judge.ts"), firstEntryJudge);
  await Bun.write(path.join(directory, "broken-judge.ts"), brokenJudge);
  const result = await loadExperiment(directory);

  if (result.status === "rejected") {
    throw new Error(result.problem);
  }

  return { experiment: result.experiment, lock: await freezeExperiment(result.experiment) };
}

function judge(options: {
  readonly script: string;
  readonly kind?: string;
  readonly votes?: number;
}) {
  return {
    kind: options.kind ?? "pairwise",
    metric: "preferred",
    rubric: "The answer file holds the right answer.",
    command: [process.execPath, `./${options.script}`],
    include: ["answer.txt"],
    votes: options.votes ?? 1,
  };
}

function scoresOf(options: {
  readonly records: readonly { arm: string; scores: Record<string, number> }[];
  readonly arm: string;
}) {
  return options.records
    .filter((record) => record.arm === options.arm)
    .map((record) => record.scores.preferred);
}

test("a pairwise judge sees each pair in both orders, and never sees an arm name", async () => {
  const { experiment, lock } = await frozen({ judges: [judge({ script: "content-judge.ts" })] });
  const summary = await runExperiment({ experiment, lock, sandbox: hostSandbox });
  const requestFolder = path.join(experiment.directory, "judge-requests");
  const requests = await Promise.all(
    (await readdir(requestFolder)).map((file) => Bun.file(path.join(requestFolder, file)).text()),
  );
  const labelOrders = requests.map((text) =>
    JSON.parse(text).entries.map(
      (entry: { label: string; files: Record<string, string> }) =>
        `${entry.label}=${entry.files["answer.txt"]}`,
    ),
  );

  expect(scoresOf({ records: summary.records, arm: "hinted" })).toEqual([1, 1]);
  expect(scoresOf({ records: summary.records, arm: "plain" })).toEqual([0.5, 0.5]);
  expect(summary.records.every((record) => record.judgeOrders === 2)).toBe(true);
  expect(requests).toHaveLength(4);
  expect(labelOrders.filter((order) => order.join() === "A=wrong,B=right")).toHaveLength(2);
  expect(labelOrders.filter((order) => order.join() === "A=right,B=wrong")).toHaveLength(2);
  expect(requests.some((text) => text.includes("hinted") || text.includes("plain"))).toBe(false);
});

test("a judge that always prefers the first entry gives no preference, because the orders cancel", async () => {
  const { experiment, lock } = await frozen({
    judges: [judge({ script: "first-entry-judge.ts" })],
  });
  const summary = await runExperiment({ experiment, lock, sandbox: hostSandbox });

  expect(scoresOf({ records: summary.records, arm: "hinted" })).toEqual([0.5, 0.5]);
  expect(scoresOf({ records: summary.records, arm: "plain" })).toEqual([0.5, 0.5]);
});

test("a rubric judge scores each run with the mean of its votes", async () => {
  const { experiment, lock } = await frozen({
    judges: [judge({ script: "content-judge.ts", kind: "rubric", votes: 3 })],
  });
  const summary = await runExperiment({ experiment, lock, sandbox: hostSandbox });
  const judgments = await readJudgments(storeOf(experiment));

  expect(scoresOf({ records: summary.records, arm: "hinted" })).toEqual([1, 1]);
  expect(scoresOf({ records: summary.records, arm: "plain" })).toEqual([0, 0]);
  expect(judgments.map((judgment) => judgment.calls)).toEqual([3, 3, 3, 3]);
  expect(summary.records.some((record) => record.judgeOrders !== undefined)).toBe(false);
});

test("a judge that fails gives no score for its metric, and the grader score stays", async () => {
  const { experiment, lock } = await frozen({ judges: [judge({ script: "broken-judge.ts" })] });
  const summary = await runExperiment({ experiment, lock, sandbox: hostSandbox });

  expect(summary.reason).toBe("complete");
  expect(summary.records.map((record) => record.status)).toEqual(Array(4).fill("completed"));
  expect(summary.records.map((record) => Object.keys(record.scores))).toEqual(
    Array(4).fill(["passed"]),
  );
});

test("the judge call limit stops the run, and the next run judges only the pairs that are left", async () => {
  const limited = await frozen({
    judges: [judge({ script: "content-judge.ts" })],
    maxJudgeCalls: 2,
  });
  const stopped = await runExperiment({ ...limited, sandbox: hostSandbox });
  const specFile = path.join(limited.experiment.directory, "experiment.json");
  const spec = await Bun.file(specFile).json();

  await Bun.write(specFile, JSON.stringify({ ...spec, maxJudgeCalls: 10 }, null, 2));
  const reloaded = await loadExperiment(limited.experiment.directory);
  const experiment = reloaded.status === "loaded" ? reloaded.experiment : limited.experiment;
  const resumed = await runExperiment({ experiment, lock: limited.lock, sandbox: hostSandbox });

  expect(stopped.reason).toBe("judge-limit");
  expect(stopped.tasksDone).toBe(1);
  expect(resumed.reason).toBe("complete");
  expect(await readAttempts(storeOf(experiment))).toHaveLength(4);
  expect((await readJudgments(storeOf(experiment))).map((judgment) => judgment.calls)).toEqual([
    2, 2,
  ]);
});

test("the answer of an agent judge is the last JSON object in its text", () => {
  expect(lastJsonObject('First {"winner": "A"} and then the final line.\n{"winner": "B"}')).toEqual(
    {
      winner: "B",
    },
  );
  expect(lastJsonObject("No object here.")).toBeUndefined();
});
