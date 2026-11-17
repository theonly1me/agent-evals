import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findVersionMismatches, readReleaseVersions } from "./releaseVersions";

const productFile = "packages/cli/src/product.json";

async function treeWith(files: Record<string, unknown>): Promise<string> {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "agent-evals-release-versions-"));

  for (const [file, content] of Object.entries(files)) {
    await Bun.write(path.join(rootDirectory, file), JSON.stringify(content));
  }

  return rootDirectory;
}

function releaseConfig(paths: readonly string[]) {
  return {
    packages: {
      ".": {
        "extra-files": paths.map((file) => ({ type: "json", path: file, jsonpath: "$.version" })),
      },
    },
  };
}

test("the product version and the Release Please manifest agree with package.json", async () => {
  const versions = await readReleaseVersions({
    rootDirectory: path.resolve(import.meta.dir, "../.."),
  });

  expect(findVersionMismatches(versions)).toEqual([]);
  expect(versions.bumped.map((source) => source.file)).toEqual([
    productFile,
    ".github/release-please-manifest.json",
  ]);
});

test("a product version that differs from package.json is reported", async () => {
  const rootDirectory = await treeWith({
    "package.json": { version: "1.2.3" },
    [productFile]: { name: "sample", version: "1.2.2" },
    ".github/release-please-config.json": releaseConfig([productFile]),
    ".github/release-please-manifest.json": { ".": "1.2.3" },
  });

  expect(findVersionMismatches(await readReleaseVersions({ rootDirectory }))).toEqual([
    `${productFile} has version 1.2.2, but package.json has 1.2.3`,
  ]);
});

test("a Release Please manifest that differs from package.json is reported", async () => {
  const rootDirectory = await treeWith({
    "package.json": { version: "1.2.3" },
    [productFile]: { name: "sample", version: "1.2.3" },
    ".github/release-please-config.json": releaseConfig([productFile]),
    ".github/release-please-manifest.json": { ".": "1.2.0" },
  });

  expect(findVersionMismatches(await readReleaseVersions({ rootDirectory }))).toEqual([
    ".github/release-please-manifest.json has version 1.2.0, but package.json has 1.2.3",
  ]);
});

test("a configuration that does not bump product.json is reported", async () => {
  const rootDirectory = await treeWith({
    "package.json": { version: "1.2.3" },
    ".github/release-please-config.json": releaseConfig([]),
    ".github/release-please-manifest.json": { ".": "1.2.3" },
  });

  expect(findVersionMismatches(await readReleaseVersions({ rootDirectory }))).toEqual([
    "product.json is not listed in the Release Please extra-files",
  ]);
});
