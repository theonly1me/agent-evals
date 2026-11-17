import { expect, test } from "bun:test";
import { cp, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkLock, freezeExperiment, loadExperiment } from "@agent-evals/experiment";

const folder = import.meta.dir;
const shared = path.join(folder, "shared");
const settings = ["claude-sonnet", "claude-opus", "codex-luna", "codex-sol"];
const pytestAnswers = Bun.spawnSync(["python3", "-m", "pytest", "--version"], {
  stdout: "ignore",
  stderr: "ignore",
}).success;

async function grade(workspace: string): Promise<Record<string, number>> {
  const child = Bun.spawn(["python3", path.join(shared, "grade.py")], {
    stdin: new Blob([JSON.stringify({ workspace })]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (stdout.trim().length === 0) {
    throw new Error(stderr);
  }

  return JSON.parse(stdout).scores;
}

async function workspaceWith(overlay: string | null): Promise<string> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-evals-no-comments-"));

  await cp(path.join(shared, "seed_repo"), workspace, { recursive: true });

  if (overlay !== null) {
    await cp(path.join(shared, overlay), workspace, { recursive: true });
  }

  return workspace;
}

test("each setting loads, holds 40 runs and 80 judge calls, and locks the shared folder", async () => {
  for (const setting of settings) {
    const loaded = await loadExperiment(path.join(folder, setting));

    expect(loaded.status).toBe("loaded");

    if (loaded.status === "loaded") {
      const { experiment } = loaded;
      const copy = await mkdtemp(path.join(os.tmpdir(), "agent-evals-no-comments-lock-"));

      await cp(folder, copy, { recursive: true });
      const copied = await loadExperiment(path.join(copy, setting));
      const lock = copied.status === "loaded" ? await freezeExperiment(copied.experiment) : null;

      expect(Object.keys(experiment.arms)).toEqual(["comments-allowed", "comments-banned"]);
      expect(experiment.repeats * 2).toBe(experiment.maxRuns ?? 0);
      expect(experiment.repeats * 2 * experiment.judges.length).toBe(experiment.maxJudgeCalls ?? 0);
      expect(Object.keys(lock?.files ?? {})).toContain("../shared/grade.py");
      expect(Object.keys(lock?.files ?? {})).toContain("../shared/hidden_tests/conftest.py");
      expect(copied.status === "loaded" ? (await checkLock(copied.experiment)).status : "").toBe(
        "matches",
      );
    }
  }
});

test.skipIf(!pytestAnswers)(
  "the grader passes the reference solution, fails the seed code, and counts new comments",
  async () => {
    const solved = await workspaceWith("reference_solution");
    const unsolved = await workspaceWith(null);
    const commented = await workspaceWith("reference_solution");
    const chargesFile = path.join(commented, "ledger/charges.py");

    await Bun.write(chargesFile, `# A new comment.\n${await Bun.file(chargesFile).text()}`);

    const solvedScores = await grade(solved);
    const unsolvedScores = await grade(unsolved);
    const commentedScores = await grade(commented);

    expect(solvedScores).toMatchObject({
      hidden_tests_passed: 1,
      all_hidden_tests_pass: 1,
      seed_tests_passed: 1,
      new_comments: 0,
      changed_source_files: 4,
    });
    expect(unsolvedScores.all_hidden_tests_pass).toBe(0);
    expect(unsolvedScores.seed_tests_passed).toBe(1);
    expect(commentedScores.new_comments).toBe(1);
    expect(
      await Bun.file(path.join(commented, "judge-view/ledger/charges.py")).text(),
    ).not.toContain("A new comment");
    expect(await Bun.file(path.join(solved, "tests_hidden/conftest.py")).exists()).toBe(false);
  },
  120_000,
);
