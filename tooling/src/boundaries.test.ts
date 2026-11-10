import { expect, test } from "bun:test";
import { checkBoundaries } from "./boundaries";
import {
  declaredGraph,
  findCycle,
  findViolations,
  observedGraph,
  packageOfFile,
} from "./boundaries/check";
import { readImports } from "./boundaries/imports";
import { edgesOf, manifestOf, treeWith } from "./boundaries/testing";

test("reads value, type, dynamic, re-export, and side-effect imports with their line numbers", () => {
  const edges = readImports({
    file: "packages/cli/src/a.ts",
    text: [
      'import { one } from "../config";',
      'import type { Two } from "../paths";',
      "",
      'export { three } from "../io/files";',
      'const lazy = await import("../mcp");',
      'import "../storage";',
      'import { z } from "zod";',
    ].join("\n"),
  });

  expect(edges.map((edge) => [edge.line, edge.specifier])).toEqual([
    [1, "../config"],
    [2, "../paths"],
    [4, "../io/files"],
    [5, "../mcp"],
    [6, "../storage"],
    [7, "zod"],
  ]);
});

test("a file belongs to the package that owns its top-level module", () => {
  expect(packageOfFile("packages/statistics/src/sums.test.ts")).toBe("statistics");
  expect(packageOfFile("packages/statistics/src/fixtures/no-comments.json")).toBe("statistics");
  expect(packageOfFile("packages/verdict/src/compare/cells.ts")).toBe("verdict");
  expect(packageOfFile("packages/cli/src/commands/compare.test.ts")).toBe("cli");
  expect(packageOfFile("packages/unlisted/src/a.ts")).toBeNull();
  expect(packageOfFile("examples/shared/a.ts")).toBeNull();
});

test("an import inside a package and an import of an allowed package pass", () => {
  const edges = edgesOf({
    "packages/cli/src/a.ts": 'import { x } from "@agent-evals/verdict";\nimport { y } from "./b";',
    "packages/verdict/src/a.ts": 'import type { z } from "@agent-evals/statistics";',
    "packages/records/src/schema/a.test.ts": 'import { z } from "../records/store";',
  });
  const manifests = new Map([
    manifestOf({ key: "statistics" }),
    manifestOf({ key: "verdict", workspaceDependencies: ["@agent-evals/statistics"] }),
    manifestOf({ key: "cli", workspaceDependencies: ["@agent-evals/verdict"] }),
  ]);

  expect(findViolations({ edges, manifests })).toEqual([]);
});

test("a value import, a type import, and a test import that break the table are reported with their position", () => {
  const edges = edgesOf({
    "packages/statistics/src/a.ts": '\nimport { x } from "@agent-evals/cli";',
    "packages/records/src/b.ts": 'import type { Y } from "@agent-evals/verdict";',
    "packages/verdict/src/c.test.ts": 'const a = 1;\nimport { z } from "@agent-evals/cli";',
  });
  const manifests = new Map([
    manifestOf({ key: "cli" }),
    manifestOf({ key: "statistics", workspaceDependencies: ["@agent-evals/cli"] }),
    manifestOf({ key: "records", workspaceDependencies: ["@agent-evals/verdict"] }),
    manifestOf({ key: "verdict", workspaceDependencies: ["@agent-evals/cli"] }),
  ]);

  expect(findViolations({ edges, manifests })).toEqual([
    {
      file: "packages/statistics/src/a.ts",
      line: 2,
      message: '"@agent-evals/cli" makes statistics depend on cli',
    },
    {
      file: "packages/records/src/b.ts",
      line: 1,
      message: '"@agent-evals/verdict" makes records depend on verdict',
    },
    {
      file: "packages/verdict/src/c.test.ts",
      line: 2,
      message: '"@agent-evals/cli" makes verdict depend on cli',
    },
  ]);
});

test("an import that leaves its package folder or comes from a file outside every package is reported", () => {
  const edges = edgesOf({
    "packages/verdict/src/a.ts": 'import data from "../../../package.json";',
    "packages/verdict/src/b.ts": 'import { x } from "../../unlisted/src/x";',
    "scripts/c.ts": 'import { x } from "./config";',
  });

  expect(findViolations({ edges }).map((violation) => violation.message)).toEqual([
    '"../../../package.json" leaves its package',
    '"../../unlisted/src/x" leaves its package',
    "file belongs to no package",
  ]);
});

test("a cycle between packages is found, and an acyclic graph has none", () => {
  const cycle = findCycle(
    new Map([
      ["a", new Set(["b"])],
      ["b", new Set(["c"])],
      ["c", new Set(["a"])],
    ]),
  );

  expect(cycle).toEqual(["a", "b", "c", "a"]);
  expect(
    findCycle(
      new Map([
        ["a", new Set(["b"])],
        ["b", new Set()],
      ]),
    ),
  ).toBeNull();
});

test("the declared dependency table and an import graph that follows it have no cycle", () => {
  const edges = edgesOf({
    "packages/cli/src/a.ts": 'import { x } from "@agent-evals/verdict";',
    "packages/verdict/src/a.ts": 'import { x } from "@agent-evals/statistics";',
  });

  expect(findCycle(declaredGraph())).toBeNull();
  expect(findCycle(observedGraph({ edges }))).toBeNull();
});

test("the observed graph reports a cycle that the import edges form", () => {
  const edges = edgesOf({
    "packages/statistics/src/a.ts": 'import { x } from "@agent-evals/verdict";',
    "packages/verdict/src/a.ts": 'import { x } from "@agent-evals/statistics";',
  });

  expect(findCycle(observedGraph({ edges }))).toEqual(["statistics", "verdict", "statistics"]);
});

test("the checker reads every source file under src and counts the files it read", async () => {
  const rootDirectory = await treeWith({
    "packages/verdict/src/a.ts": 'import { x } from "../../cli/src/doctor";\n',
    "packages/cli/src/doctor.ts": "export const x = 1;\n",
    "docs/ignored.ts": 'import { x } from "../packages/cli/src/doctor";\n',
  });

  const report = await checkBoundaries({ rootDirectory });

  expect(report.fileCount).toBe(2);
  expect(report.violations).toEqual([
    {
      file: "packages/verdict/src/a.ts",
      line: 1,
      message: '"../../cli/src/doctor" leaves its package',
    },
  ]);
  expect(report.observedCycle).toBeNull();
});
