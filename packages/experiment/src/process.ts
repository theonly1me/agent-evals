export type ProcessRequest = {
  readonly command: readonly string[];
  readonly input: string;
  readonly workingDirectory: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly timeoutSeconds: number;
  readonly onTimeout?: () => Promise<void>;
};

export type ProcessResult =
  | {
      readonly status: "exited";
      readonly exitCode: number;
      readonly stdout: string;
      readonly stderr: string;
    }
  | { readonly status: "timeout"; readonly stdout: string; readonly stderr: string }
  | { readonly status: "not-started"; readonly detail: string };

export async function runProcess(request: ProcessRequest): Promise<ProcessResult> {
  let timedOut = false;

  try {
    const child = Bun.spawn([...request.command], {
      cwd: request.workingDirectory,
      env: { ...request.environment },
      stdin: new Blob([request.input]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, request.timeoutSeconds * 1000);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    clearTimeout(timer);

    if (timedOut) {
      await request.onTimeout?.();
    }

    return timedOut
      ? { status: "timeout", stdout, stderr }
      : { status: "exited", exitCode, stdout, stderr };
  } catch (error) {
    return {
      status: "not-started",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
