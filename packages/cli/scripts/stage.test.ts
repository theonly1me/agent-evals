import { expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import product from "../src/product.json" with { type: "json" };
import { buildRuntimeBundle, bundleFileName } from "./bundle";
import { stageCliPackage } from "./stage";

const packageDirectory = path.resolve(import.meta.dir, "..");
const workspaceRoot = path.resolve(packageDirectory, "../..");

async function outputOf(command: readonly string[]) {
  const child = Bun.spawn([...command], { stdout: "pipe", stderr: "pipe", cwd: os.tmpdir() });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { stdout, stderr, exitCode };
}

test("the stage fails and writes nothing when the build output is missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-evals-stage-"));
  const outputDirectory = path.join(root, "package");

  await mkdir(path.join(root, "workspace"));

  await expect(
    stageCliPackage({
      packageDirectory,
      distDirectory: path.join(root, "missing-dist"),
      workspaceRoot: path.join(root, "workspace"),
      outputDirectory,
    }),
  ).rejects.toThrow("these inputs are missing: dist (");
  expect(await Bun.file(path.join(outputDirectory, "package.json")).exists()).toBeFalse();
});

test("the staged package runs from a new folder and has no workspace dependency", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-evals-stage-"));
  const distDirectory = path.join(root, "dist");
  const outputDirectory = path.join(root, "package");

  await Bun.write(
    path.join(distDirectory, bundleFileName),
    await buildRuntimeBundle(path.join(packageDirectory, "src/main.ts")),
  );

  const manifest = await stageCliPackage({
    packageDirectory,
    distDirectory,
    workspaceRoot,
    outputDirectory,
  });
  const bundle = path.join(outputDirectory, "dist", bundleFileName);
  const version = await outputOf([process.execPath, bundle, "--version"]);
  const verdict = await outputOf([
    process.execPath,
    bundle,
    "compare",
    path.join(workspaceRoot, "examples/quick-start/runs.jsonl"),
    "--baseline",
    "without-skill",
  ]);

  expect(manifest).toMatchObject({ name: "agent-evals", version: product.version });
  expect(Object.keys(manifest.dependencies)).toEqual(["bun"]);
  expect(version).toEqual({ stdout: `${product.version}\n`, stderr: "", exitCode: 0 });
  expect(verdict.stdout).toStartWith("with-skill is better than without-skill on passed.");
  expect(await Bun.file(path.join(outputDirectory, "bin/agent-evals.mjs")).exists()).toBeTrue();
  expect(await Bun.file(path.join(outputDirectory, "LICENSE-MIT")).exists()).toBeTrue();
}, 30_000);
