import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IsolationLevel, Sandbox } from "./sandbox";
import type { Experiment } from "./spec";
import type { Store } from "./store";

export const canaryVariable = "AGENT_EVALS_CANARY";

export type IsolationProbe =
  | { readonly status: "isolated"; readonly level: IsolationLevel; readonly token: string }
  | { readonly status: "leaked"; readonly problem: string }
  | { readonly status: "not-run"; readonly problem: string };

const probeSeconds = 120;
const separator = "\u001f";

function probeScript(options: { readonly fileName: string; readonly realFile: string }): string {
  return [
    `printf '%s${separator}' "$${canaryVariable}"`,
    `cat "$HOME/${options.fileName}" 2>/dev/null`,
    `printf '${separator}'`,
    `cat "${options.realFile}" 2>/dev/null`,
    "true",
  ].join("; ");
}

export async function probeIsolation(options: {
  readonly sandbox: Sandbox;
  readonly experiment: Experiment;
  readonly store: Store;
  readonly realHome?: string;
}): Promise<IsolationProbe> {
  const { sandbox, experiment, store } = options;
  const token = crypto.randomUUID().replaceAll("-", "");
  const fileName = `.agent-evals-canary-${token.slice(0, 8)}`;
  const realFile = path.join(options.realHome ?? os.homedir(), fileName);
  const root = path.join(store.directory, "work", `probe-${token.slice(0, 8)}`);
  const paths = {
    workspace: path.join(root, "workspace"),
    home: path.join(root, "home"),
    experiment: experiment.directory,
  };

  await mkdir(paths.workspace, { recursive: true });
  await mkdir(paths.home, { recursive: true });
  await Bun.write(realFile, token);
  const previous = process.env[canaryVariable];

  process.env[canaryVariable] = token;

  try {
    const result = await sandbox.run({
      name: `agent-evals-probe-${token.slice(0, 8)}`,
      command: ["sh", "-c", probeScript({ fileName, realFile })],
      input: "",
      paths,
      environment: {},
      timeoutSeconds: probeSeconds,
      image: experiment.image,
    });

    if (result.status !== "exited" || result.exitCode !== 0) {
      const detail = result.status === "not-started" ? result.detail : result.status;

      return { status: "not-run", problem: `The isolation probe did not run: ${detail}.` };
    }

    const [fromEnvironment = "", fromHome = "", fromRealPath = ""] = result.stdout.split(separator);

    if (fromEnvironment.includes(token)) {
      return {
        status: "leaked",
        problem: "The sandbox passed an environment variable of the runner to the subject.",
      };
    }

    if (fromHome.includes(token)) {
      return {
        status: "leaked",
        problem: "The home folder of the subject is the home folder of the user.",
      };
    }

    if (sandbox.isolation === "container" && fromRealPath.includes(token)) {
      return {
        status: "leaked",
        problem: "The container can read the home folder of the user.",
      };
    }

    return { status: "isolated", level: sandbox.isolation, token };
  } finally {
    if (previous === undefined) {
      delete process.env[canaryVariable];
    } else {
      process.env[canaryVariable] = previous;
    }

    await rm(realFile, { force: true });
    await rm(root, { recursive: true, force: true });
  }
}
