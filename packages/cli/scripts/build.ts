import { rm } from "node:fs/promises";
import path from "node:path";
import { buildRuntimeBundle, bundleFileName } from "./bundle";

const packageDirectory = path.resolve(import.meta.dir, "..");
const distDirectory = path.join(packageDirectory, "dist");
const outputFile = path.join(distDirectory, bundleFileName);
const bundle = await buildRuntimeBundle(path.join(packageDirectory, "src/main.ts"));

await rm(distDirectory, { recursive: true, force: true });
await Bun.write(outputFile, bundle);

console.log(
  `${path.relative(process.cwd(), outputFile)} ${(Bun.file(outputFile).size / 1000).toFixed(0)} KB`,
);
