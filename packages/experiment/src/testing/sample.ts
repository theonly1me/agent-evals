import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const subjectSource = `
const request = JSON.parse(await Bun.stdin.text());
const marker = process.env.FAIL_ONCE_MARKER;
if (marker && request.task.id === "flaky" && !(await Bun.file(marker).exists())) {
  await Bun.write(marker, "failed once");
  process.exit(3);
}
const limitMarker = process.env.LIMIT_ONCE_MARKER;
if (limitMarker && request.task.id === "limited" && !(await Bun.file(limitMarker).exists())) {
  await Bun.write(limitMarker, "limited once");
  console.log(JSON.stringify({ status: "infra-failure", limited: true, detail: "usage limit reached" }));
  process.exit(0);
}
if (request.task.id === "slow") {
  await Bun.sleep(5000);
}
const hinted = await Bun.file("HINT.md").exists();
await Bun.write("answer.txt", hinted ? "right" : "wrong");
console.log(JSON.stringify({
  output: JSON.stringify({ home: process.env.HOME, environment: Object.keys(process.env).sort() }),
  costUsd: 0.25,
  versions: { subject: "1.0.0" },
}));
`;

const graderSource = `
const text = await Bun.stdin.text();
const request = JSON.parse(text);
await Bun.write("grader-requests/" + request.task.id + "-" + Date.now() + "-" + Math.random() + ".json", text);
const answer = Bun.file(request.workspace + "/answer.txt");
const passed = (await answer.exists()) && (await answer.text()) === "right" ? 1 : 0;
console.log(JSON.stringify({ scores: { passed } }));
`;

export type SampleOptions = {
  readonly tasks?: readonly string[];
  readonly spec?: Readonly<Record<string, unknown>>;
};

export async function writeSampleExperiment(options: SampleOptions = {}): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-evals-experiment-"));
  const tasks = options.tasks ?? ["a", "b", "c", "d"];
  const spec = {
    name: "sample",
    metric: "passed",
    baseline: "plain",
    arms: { plain: {}, hinted: { files: { "HINT.md": "arms/hinted/HINT.md" } } },
    tasks: tasks.map((id) => ({ id, prompt: `Solve ${id}.` })),
    subject: { command: [process.execPath, "./subject.ts"] },
    grader: { command: [process.execPath, "./grader.ts"] },
    repeats: 2,
    timeoutSeconds: 20,
    ...options.spec,
  };

  await Bun.write(path.join(directory, "experiment.json"), JSON.stringify(spec, null, 2));
  await Bun.write(path.join(directory, "subject.ts"), subjectSource);
  await Bun.write(path.join(directory, "grader.ts"), graderSource);
  await Bun.write(path.join(directory, "arms/hinted/HINT.md"), "The answer is right.\n");

  return directory;
}
