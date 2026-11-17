import { expect, test } from "bun:test";
import { chmod, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { freezeExperiment } from "./lock";
import { type RunSummary, runExperiment } from "./runner";
import { hostSandbox } from "./sandbox";
import { loadExperiment } from "./spec";
import { type Attempt, readAttempts, storeOf } from "./store";
import { writeSampleExperiment } from "./testing/sample";

const fakeClaude = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi
printf '%s\\n' "$@" > arguments.txt
case "$2" in
  *broken*) printf '{"result":"Invalid API key","is_error":true}' ;;
  *) printf '{"result":"I wrote the file.","is_error":false,"total_cost_usd":0.5}' ;;
esac
`;

const fakeCodex = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "codex-cli 8.8.8"; exit 0; fi
printf '%s\\n' "$@" > arguments.txt
if [ -f "$HOME/.codex/auth.json" ]; then auth=yes; else auth=no; fi
printf '{"type":"thread.started"}\\n'
printf '{"type":"item.completed","item":{"type":"reasoning","text":"hidden"}}\\n'
printf '{"type":"item.completed","item":{"type":"agent_message","text":"auth=%s"}}\\n' "$auth"
printf '{"type":"turn.completed"}\\n'
`;

async function runWithFakeAgents(spec: Record<string, unknown>): Promise<{
  readonly summary: RunSummary;
  readonly attempts: readonly Attempt[];
  readonly argumentsOf: (attempt: Attempt) => Promise<readonly string[]>;
}> {
  const bin = await mkdtemp(path.join(os.tmpdir(), "agent-evals-bin-"));
  const realHome = await mkdtemp(path.join(os.tmpdir(), "agent-evals-real-home-"));

  await Bun.write(path.join(bin, "claude"), fakeClaude);
  await Bun.write(path.join(bin, "codex"), fakeCodex);
  await chmod(path.join(bin, "claude"), 0o755);
  await chmod(path.join(bin, "codex"), 0o755);
  await Bun.write(path.join(realHome, ".codex/auth.json"), "{}");

  const loaded = await loadExperiment(
    await writeSampleExperiment({ spec: { repeats: 1, ...spec } }),
  );

  if (loaded.status === "rejected") {
    throw new Error(loaded.problem);
  }

  const { experiment } = loaded;
  const lock = await freezeExperiment(experiment);
  const previousPath = process.env.PATH;

  process.env.PATH = `${bin}:${previousPath}`;

  try {
    const summary = await runExperiment({ experiment, lock, sandbox: hostSandbox, realHome });
    const store = storeOf(experiment);

    return {
      summary,
      attempts: await readAttempts(store),
      argumentsOf: async (attempt) =>
        (
          await Bun.file(
            path.join(store.directory, "work", attempt.work ?? "", "workspace/arguments.txt"),
          ).text()
        )
          .trim()
          .split("\n"),
    };
  } finally {
    process.env.PATH = previousPath;
  }
}

test("the claude-code subject passes the prompt, the model, and the flags, and reads the cost", async () => {
  const { summary, attempts, argumentsOf } = await runWithFakeAgents({
    tasks: [{ id: "a", prompt: "Solve a." }],
    subject: { agent: "claude-code" },
    arms: { plain: {}, hinted: { model: "sample-model", flags: ["--max-turns", "3"] } },
  });
  const hinted = attempts.find((attempt) => attempt.arm === "hinted");
  const plain = attempts.find((attempt) => attempt.arm === "plain");

  expect(hinted && (await argumentsOf(hinted))).toEqual([
    "--print",
    "Solve a.",
    "--output-format",
    "json",
    "--dangerously-skip-permissions",
    "--model",
    "sample-model",
    "--max-turns",
    "3",
  ]);
  expect(plain && (await argumentsOf(plain))).toEqual([
    "--print",
    "Solve a.",
    "--output-format",
    "json",
    "--dangerously-skip-permissions",
  ]);
  expect(summary.records.map((record) => record.status)).toEqual(["completed", "completed"]);
  expect(summary.records[0]).toMatchObject({
    subject: "claude-code",
    costUsd: 0.5,
    versions: { "claude-code": "9.9.9 (Claude Code)" },
  });
});

test("an error result of claude-code is a failure with no score, not a score of 0", async () => {
  const { summary, attempts } = await runWithFakeAgents({
    tasks: [{ id: "a", prompt: "A broken request." }],
    subject: { agent: "claude-code" },
    retries: 0,
  });

  expect(summary.records.map((record) => [record.status, record.scores])).toEqual([
    ["infra-failure", {}],
    ["infra-failure", {}],
  ]);
  expect(attempts[0]?.detail).toBe("claude-code reported an error: Invalid API key");
});

test("the codex subject gets the auth file in its new home, and the output is the agent message", async () => {
  const { summary, attempts, argumentsOf } = await runWithFakeAgents({
    tasks: [{ id: "a", prompt: "Solve a." }],
    subject: { agent: "codex" },
    auth: { files: { ".codex/auth.json": "~/.codex/auth.json" } },
    grader: {
      command: [
        process.execPath,
        "-e",
        'const r = JSON.parse(await Bun.stdin.text()); console.log(JSON.stringify({ scores: { passed: r.output === "auth=yes" ? 1 : 0 } }));',
      ],
    },
  });
  const [first] = attempts;

  expect(first && (await argumentsOf(first))).toEqual([
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "Solve a.",
  ]);
  expect(summary.records.map((record) => record.scores)).toEqual([{ passed: 1 }, { passed: 1 }]);
  expect(summary.records[0]?.versions).toEqual({ codex: "codex-cli 8.8.8" });
});
