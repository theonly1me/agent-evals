import { type ProcessRequest, type ProcessResult, runProcess } from "./process";

export type SandboxRequest = ProcessRequest & {
  readonly homeDirectory: string;
};

export type Sandbox = {
  readonly name: string;
  readonly run: (request: SandboxRequest) => Promise<ProcessResult>;
};

const inheritedNames = ["PATH", "LANG", "TMPDIR"] as const;

export function inheritedEnvironment(options: {
  readonly source: Readonly<Record<string, string | undefined>>;
  readonly passEnv: readonly string[];
}): Record<string, string> {
  const environment: Record<string, string> = {};

  for (const name of [...inheritedNames, ...options.passEnv]) {
    const value = options.source[name];

    if (value !== undefined) {
      environment[name] = value;
    }
  }

  return environment;
}

export const hostSandbox: Sandbox = {
  name: "host",
  run: (request) =>
    runProcess({
      ...request,
      environment: { ...request.environment, HOME: request.homeDirectory },
    }),
};
