import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand } from "./main";
import release from "./version.json" with { type: "json" };

const importerFixtures = path.join(import.meta.dir, "../../importers/src/fixtures");
const promptfooOutput = path.join(importerFixtures, "promptfoo-output.json");
const harborJob = path.join(importerFixtures, "harbor-job");

async function writeRuns(lines: readonly object[]): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-evals-cli-"));
  const file = path.join(directory, "runs.jsonl");

  await Bun.write(file, lines.map((line) => JSON.stringify(line)).join("\n"));

  return file;
}

function run(options: { task: string; arm: string; passed: number }) {
  return { ...options, repeat: 0, status: "completed", scores: { passed: options.passed } };
}

test("the executable prints the version and exits with 0", async () => {
  const child = Bun.spawn(["bun", "run", path.join(import.meta.dir, "main.ts"), "--version"], {
    stdout: "pipe",
  });

  expect((await new Response(child.stdout).text()).trim()).toBe(release.version);
  expect(await child.exited).toBe(0);
});

test("two result locations compare the first as the baseline and the second as the candidate", async () => {
  const tasks = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const before = await writeRuns(tasks.map((task) => run({ task, arm: "x", passed: 0 })));
  const after = await writeRuns(tasks.map((task) => run({ task, arm: "x", passed: 1 })));
  const outcome = await runCommand(["compare", before, after]);

  expect(outcome.exitCode).toBe(0);
  expect(outcome.stdout).toStartWith("candidate is better than baseline on passed.");
  expect(outcome.stdout).toContain("Difference: +1 (95% interval 1 to 1, p = 0.008) over 8 tasks.");
});

test("one location needs a named baseline, and takes the other arm as the candidate", async () => {
  const unnamed = await runCommand(["compare", promptfooOutput, "--metric", "success"]);
  const named = await runCommand([
    "compare",
    promptfooOutput,
    "--baseline",
    "candidate",
    "--metric",
    "success",
  ]);

  expect(unnamed.exitCode).toBe(1);
  expect(unnamed.stderr).toBe(
    "Name the baseline arm with --baseline. The arms are: baseline, candidate.\n",
  );
  expect(named.stdout).toStartWith(
    "Not conclusive: the results cannot tell baseline from candidate",
  );
});

test("results with two metrics need a named metric, and an unknown metric lists the real ones", async () => {
  const unnamed = await runCommand(["compare", promptfooOutput, "--baseline", "baseline"]);
  const unknown = await runCommand([
    "compare",
    promptfooOutput,
    "--baseline",
    "baseline",
    "--metric",
    "reward",
  ]);

  expect(unnamed.stderr).toBe(
    "Name the metric to compare with --metric. The metrics are: score, success.\n",
  );
  expect(unknown.stderr).toBe('No run has the metric "reward". The metrics are: score, success.\n');
});

test("a Harbor job folder gives a report with the versions check, and --output writes the file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-evals-cli-"));
  const output = path.join(directory, "report.html");
  const outcome = await runCommand([
    "compare",
    harborJob,
    harborJob,
    "--format",
    "html",
    "--output",
    output,
  ]);
  const html = await Bun.file(output).text();

  expect(outcome.stdout).toStartWith("Not conclusive:");
  expect(outcome.stdout).toEndWith(`Wrote ${output}\n`);
  expect(html).toStartWith("<!doctype html>");
  expect(html).toContain("Both arms used the same versions.");
});

test("a wrong flag, a wrong format, and a missing location fail with the usage", async () => {
  const wrongFlag = await runCommand(["compare", harborJob, "--metrics", "reward"]);
  const wrongFormat = await runCommand(["compare", harborJob, harborJob, "--format", "pdf"]);
  const missing = await runCommand(["compare", path.join(importerFixtures, "absent")]);

  expect(wrongFlag.exitCode).toBe(1);
  expect(wrongFlag.stderr).toContain("Usage:");
  expect(wrongFormat.stderr).toStartWith("--format must be one of: text, markdown, html, json.");
  expect(missing.stderr).toEndWith("absent does not exist.\n");
});
