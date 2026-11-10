import os from "node:os";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dir, "../../..");

export const bundleFileName = "agent-evals.js";

export async function buildRuntimeBundle(entryPoint: string): Promise<Bun.BuildArtifact> {
  const result = await Bun.build({ entrypoints: [entryPoint], target: "bun", minify: true });
  const [bundle, ...otherOutputs] = result.outputs;

  if (!result.success || !bundle || otherOutputs.length > 0) {
    throw new Error("The runtime bundle did not build as one file.");
  }

  const text = await bundle.text();
  const privateRoots = [
    process.cwd(),
    workspaceRoot,
    os.homedir(),
    path.dirname(path.resolve(entryPoint)),
  ];

  if (privateRoots.some((root) => text.includes(root))) {
    throw new Error("The runtime bundle contains a build-machine path.");
  }

  return bundle;
}
