import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findPrivacyFindings, hashTerm, normalizeTerm } from "./privacy";

async function treeWith(files: Record<string, string>): Promise<string> {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-evals-privacy-"));

  for (const [file, text] of Object.entries(files)) {
    await Bun.write(path.join(rootDirectory, file), text);
  }

  return rootDirectory;
}

const firstAddress = ["dana", "corp.dev"].join("@");
const secondAddress = ["lee", "corp.dev"].join("@");

function described(findings: readonly { file: string; line: number; rule: string }[]) {
  return findings.map((finding) => `${finding.file}:${finding.line} ${finding.rule}`);
}

test("the repository has no private material", async () => {
  const report = await findPrivacyFindings({
    rootDirectory: path.resolve(import.meta.dir, "../.."),
  });

  expect(report.findings).toEqual([]);
  expect(report.checkedFileCount).toBeGreaterThan(100);
});

test("flags a real address on its line, in prose and in a results file", async () => {
  const rootDirectory = await treeWith({
    "docs/notes.md": `# Notes\nAsk ${firstAddress} before the run.\n`,
    "examples/sample/runs.jsonl": `{"task":"a","evaluator":"${secondAddress}"}\n`,
  });

  const report = await findPrivacyFindings({ rootDirectory, privateTerms: [] });

  expect(described(report.findings)).toEqual([
    "docs/notes.md:2 email",
    "examples/sample/runs.jsonl:1 email",
  ]);
});

test("allows an example address, the git remote address, and the maintainer contact page", async () => {
  const rootDirectory = await treeWith({
    "docs/notes.md": "Write to user@example.com or clone git@github.com:owner/repository.git.\n",
    "CODE_OF_CONDUCT.md": `Report a problem to ${firstAddress}.\n`,
  });

  expect((await findPrivacyFindings({ rootDirectory, privateTerms: [] })).findings).toEqual([]);
});

test("flags a gendered pronoun in Markdown but not inside a script", async () => {
  const rootDirectory = await treeWith({
    "docs/notes.md": "Ask the user before he merges.\n",
    "scripts/check.mjs": 'export const label = "her";\n',
  });

  expect(
    described((await findPrivacyFindings({ rootDirectory, privateTerms: [] })).findings),
  ).toEqual(["docs/notes.md:1 pronoun"]);
});

test("flags a private phrase by its hash, across case and spacing", async () => {
  const rootDirectory = await treeWith({
    "docs/notes.md": "Follow the Acme   Rocket conventions.\nThe acme team agrees.\n",
  });

  const report = await findPrivacyFindings({ rootDirectory, privateTerms: ["acme rocket"] });

  expect(described(report.findings)).toEqual(["docs/notes.md:1 private-term"]);
  expect(normalizeTerm("  ACME   Rocket! ")).toBe("acme rocket");
  expect(hashTerm("Acme Rocket")).toBe(hashTerm("acme rocket"));
  expect(hashTerm("acme rocket")).not.toBe(hashTerm("acme"));
});
