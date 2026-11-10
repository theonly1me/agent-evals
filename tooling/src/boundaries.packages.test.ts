import { expect, test } from "bun:test";
import { checkBoundaries } from "./boundaries";
import { findCycle, findViolations, observedGraph } from "./boundaries/check";
import type { ManifestIndex } from "./boundaries/manifests";
import { edgesOf, manifestOf, treeWith } from "./boundaries/testing";

const manifests: ManifestIndex = new Map([
  manifestOf({ key: "statistics", exportedSubpaths: [".", "./testing"] }),
  manifestOf({ key: "verdict", workspaceDependencies: ["@agent-evals/statistics"] }),
  manifestOf({ key: "cli" }),
  manifestOf({ key: "examples", workspaceDependencies: ["@agent-evals/statistics"] }),
]);

function messagesFor(files: Record<string, string>) {
  return findViolations({ edges: edgesOf(files), manifests }).map((violation) => violation.message);
}

test("a declared, exported, allowed package import passes in a package and in examples", () => {
  expect(
    messagesFor({
      "packages/verdict/src/a.ts": 'import { x } from "@agent-evals/statistics";',
      "packages/verdict/src/b.test.ts": 'import { y } from "@agent-evals/statistics/testing";',
      "examples/fixed/a.ts": 'import { x } from "@agent-evals/statistics";',
    }),
  ).toEqual([]);
});

test("a subpath that the target does not export is reported", () => {
  expect(
    messagesFor({
      "examples/fixed/a.ts": 'import { x } from "@agent-evals/statistics/internal/rules";',
    }),
  ).toEqual([
    '"@agent-evals/statistics/internal/rules" is not listed in the exports of @agent-evals/statistics',
  ]);
});

test("a package that the importing package.json does not declare is reported", () => {
  expect(
    messagesFor({ "packages/verdict/src/a.ts": 'import { x } from "@agent-evals/cli";' }),
  ).toEqual([
    "@agent-evals/cli is not declared in the package.json that owns this file",
    '"@agent-evals/cli" makes verdict depend on cli',
  ]);
  expect(
    messagesFor({ "examples/fixed/a.ts": 'import { x } from "@agent-evals/verdict";' }),
  ).toEqual(["@agent-evals/verdict is not declared in the package.json that owns this file"]);
});

test("a package that imports its own name, a missing package, or a higher package is reported", () => {
  expect(
    messagesFor({
      "packages/statistics/src/config/a.ts": 'import { x } from "@agent-evals/statistics";',
      "packages/statistics/src/config/b.ts": 'import { x } from "@agent-evals/missing";',
    }),
  ).toEqual([
    "@agent-evals/statistics is not declared in the package.json that owns this file",
    '"@agent-evals/statistics" makes statistics import its own package',
    '"@agent-evals/missing" is not a workspace package',
  ]);
});

test("a relative import that leaves its package folder is reported, and one that stays is not", () => {
  expect(
    messagesFor({
      "packages/verdict/src/a.ts": 'import { x } from "../../statistics/src/paths";',
      "packages/verdict/src/b.ts": 'import { y } from "../../../scripts/build";',
      "packages/verdict/src/c.ts": 'import { z } from "./rules";',
    }),
  ).toEqual([
    '"../../statistics/src/paths" leaves its package',
    '"../../../scripts/build" leaves its package',
  ]);
});

test("a package and examples cannot reach into another package folder by a relative path", () => {
  expect(
    messagesFor({
      "packages/cli/src/a.ts": 'import { x } from "../../statistics/src/paths";',
      "examples/fixed/a.ts": 'import { y } from "../../packages/statistics/src/paths";',
      "examples/fixed/b.ts": 'import { z } from "../shared/helper";',
    }),
  ).toEqual([
    '"../../statistics/src/paths" leaves its package',
    '"../../packages/statistics/src/paths" leaves its package',
  ]);
});

test("the observed graph counts a package import by name and reports the cycle that it closes", () => {
  const edges = edgesOf({
    "packages/statistics/src/config/a.ts": 'import { x } from "@agent-evals/verdict";',
    "packages/verdict/src/a.ts": 'import { x } from "@agent-evals/statistics";',
  });

  expect(findCycle(observedGraph({ edges }))).toEqual(["statistics", "verdict", "statistics"]);
});

test("the checker reports a package.json that breaks the rules", async () => {
  const rootDirectory = await treeWith({
    "package.json": JSON.stringify({
      name: "agent-evals-workspace",
      devDependencies: { "@agent-evals/nope": "workspace:*" },
    }),
    "packages/verdict/package.json": JSON.stringify({
      name: "@agent-evals/verdict",
      version: "1.0.0",
      dependencies: { "@agent-evals/cli": "workspace:*" },
    }),
    "packages/verdict/src/a.ts": "export const a = 1;\n",
  });

  const report = await checkBoundaries({ rootDirectory });

  expect(report.fileCount).toBe(1);
  expect(report.violations.map((violation) => [violation.file, violation.message])).toEqual([
    ["package.json", "@agent-evals/nope is not a workspace package"],
    ["packages/verdict/package.json", "a workspace package must be private"],
    ["packages/verdict/package.json", "a workspace package has no version"],
    ["packages/verdict/package.json", "cli is not a dependency that verdict may declare"],
  ]);
});
