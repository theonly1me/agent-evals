#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bundle = path.join(packageDirectory, "dist", "agent-evals.js");

function runs(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

function bundledBunPath() {
  try {
    const manifestPath = require.resolve("bun/package.json");
    const manifest = require(manifestPath);
    const relative = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.bun;

    if (typeof relative !== "string") {
      return null;
    }

    const candidate = path.join(path.dirname(manifestPath), relative);

    return existsSync(candidate) && runs(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function bunOnPath() {
  return runs("bun") ? "bun" : null;
}

const runtime = bundledBunPath() ?? bunOnPath();

if (runtime === null) {
  console.error(
    "agent-evals: bun was not found. Reinstall with npm i -g agent-evals, or install bun from https://bun.sh",
  );
  process.exit(1);
}

const result = spawnSync(runtime, [bundle, ...process.argv.slice(2)], { stdio: "inherit" });

if (result.error) {
  console.error("agent-evals: could not start bun");
  process.exit(1);
}

process.exit(result.status ?? 1);
