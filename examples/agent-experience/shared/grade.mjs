import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const shared = path.dirname(fileURLToPath(import.meta.url));
const expectedFlags = JSON.parse(readFileSync(path.join(shared, "expected.json"), "utf8"));
const request = JSON.parse(readFileSync(0, "utf8"));
const flags = expectedFlags[request.task.id];

if (flags === undefined) {
  console.error(`no expected answer for the task ${request.task.id}`);
  process.exit(2);
}

const expected = spawnSync(
  "node",
  [path.join(shared, "workspace/tally.mjs"), path.join(shared, "workspace/orders.csv"), ...flags],
  {
    encoding: "utf8",
  },
);

if (expected.status !== 0) {
  console.error(expected.stderr);
  process.exit(2);
}

const answerFile = path.join(request.workspace, "answer.txt");
const answer = existsSync(answerFile) ? readFileSync(answerFile, "utf8").trim() : "";

process.stdout.write(
  JSON.stringify({ scores: { correct: answer === expected.stdout.trim() ? 1 : 0 } }),
);
