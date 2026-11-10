export type CommandOutcome = {
  readonly exitCode: 0 | 1;
  readonly stdout: string;
  readonly stderr: string;
};

export function succeeded(stdout: string): CommandOutcome {
  return { exitCode: 0, stdout, stderr: "" };
}

export function failed(problem: string): CommandOutcome {
  return { exitCode: 1, stdout: "", stderr: `${problem}\n` };
}
