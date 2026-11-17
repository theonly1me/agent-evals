import { type ProcessResult, runProcess } from "./process";

export type RunPaths = {
  readonly workspace: string;
  readonly home: string;
  readonly experiment: string;
};

export type IsolationLevel = "home" | "container";

export type SandboxRequest = {
  readonly name: string;
  readonly command: readonly string[];
  readonly input: string;
  readonly paths: RunPaths;
  readonly environment: Readonly<Record<string, string>>;
  readonly timeoutSeconds: number;
  readonly image?: string;
};

export type Sandbox = {
  readonly name: "host" | "docker";
  readonly isolation: IsolationLevel;
  readonly locate: (paths: RunPaths) => RunPaths;
  readonly run: (request: SandboxRequest) => Promise<ProcessResult>;
};

const hostNames = ["PATH", "LANG", "TMPDIR"] as const;

export function namedEnvironment(options: {
  readonly source: Readonly<Record<string, string | undefined>>;
  readonly names: readonly string[];
}): Record<string, string> {
  const environment: Record<string, string> = {};

  for (const name of options.names) {
    const value = options.source[name];

    if (value !== undefined) {
      environment[name] = value;
    }
  }

  return environment;
}

export const hostSandbox: Sandbox = {
  name: "host",
  isolation: "home",
  locate: (paths) => paths,
  run: (request) =>
    runProcess({
      command: request.command,
      input: request.input,
      workingDirectory: request.paths.workspace,
      timeoutSeconds: request.timeoutSeconds,
      environment: {
        ...namedEnvironment({ source: process.env, names: hostNames }),
        ...request.environment,
        HOME: request.paths.home,
      },
    }),
};
