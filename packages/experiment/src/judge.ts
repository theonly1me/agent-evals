import { mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { type ProcessResult, runProcess } from "./process";
import { protocolVersion } from "./protocol";
import { hostSandbox, namedEnvironment } from "./sandbox";
import type { Experiment, Judge } from "./spec";
import { agentProgram } from "./subjects";

export type JudgeEntry = {
  readonly label: string;
  readonly output: string;
  readonly files: Readonly<Record<string, string>>;
};

export type JudgeRequest = {
  readonly protocol: typeof protocolVersion;
  readonly kind: "judge";
  readonly mode: Judge["kind"];
  readonly rubric: string;
  readonly task: { readonly id: string; readonly prompt: string };
  readonly entries: readonly JudgeEntry[];
};

export type JudgeAnswer =
  | { readonly status: "answered"; readonly answer: unknown }
  | { readonly status: "failed"; readonly detail: string };

export type AskJudge = (options: {
  readonly judge: Judge;
  readonly request: JudgeRequest;
  readonly scratchDirectory: string;
}) => Promise<JudgeAnswer>;

const pairwiseAnswerSchema = z.object({ winner: z.enum(["A", "B", "tie"]) });
const rubricAnswerSchema = z.object({ pass: z.boolean() });
const fileCharacterLimit = 20_000;
const totalCharacterLimit = 60_000;

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function lastJsonObject(text: string): unknown {
  const starts = [...text.matchAll(/\{/g)].map((match) => match.index).reverse();

  for (const start of starts) {
    const end = text.lastIndexOf("}");
    const parsed = end > start ? parsedJson(text.slice(start, end + 1)) : undefined;

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function answerShape(mode: Judge["kind"]): string {
  return mode === "pairwise"
    ? '{"winner": "A"}, {"winner": "B"}, or {"winner": "tie"}'
    : '{"pass": true} or {"pass": false}';
}

export function judgePrompt(request: JudgeRequest): string {
  const entries = request.entries.map((entry) => {
    const files = Object.entries(entry.files).map(
      ([name, text]) => `File ${name}:\n\`\`\`\n${text}\n\`\`\``,
    );

    return [`## Entry ${entry.label}`, `Final message:\n${entry.output}`, ...files].join("\n\n");
  });
  const question =
    request.mode === "pairwise"
      ? "Two entries answer the same task. Decide which entry is better by the rubric."
      : "One entry answers the task. Decide if the entry passes the rubric.";

  return [
    "You are a judge in an experiment. Do not use tools. Read the material and answer.",
    question,
    `# Task\n\n${request.task.prompt}`,
    `# Rubric\n\n${request.rubric}`,
    ...entries,
    `Give your reasons in a few sentences. Then write one JSON object on the last line: ${answerShape(request.mode)}`,
  ].join("\n\n");
}

function answerOf(options: { readonly result: ProcessResult; readonly text: string | null }) {
  const { result, text } = options;

  if (result.status === "not-started") {
    return { status: "failed" as const, detail: `the judge did not start: ${result.detail}` };
  }

  if (result.status === "timeout") {
    return { status: "failed" as const, detail: "the judge did not finish in time" };
  }

  if (result.exitCode !== 0 || text === null) {
    return {
      status: "failed" as const,
      detail: `the judge exited with code ${result.exitCode}: ${result.stderr.trim().slice(-300)}`,
    };
  }

  const answer = lastJsonObject(text);

  return answer === undefined
    ? { status: "failed" as const, detail: "the judge did not write a JSON answer" }
    : { status: "answered" as const, answer };
}

export function askJudgeFor(experiment: Experiment): AskJudge {
  return async ({ judge, request, scratchDirectory }) => {
    const paths = {
      workspace: path.join(scratchDirectory, "workspace"),
      home: path.join(scratchDirectory, "home"),
      experiment: experiment.directory,
    };

    await mkdir(paths.workspace, { recursive: true });
    await mkdir(paths.home, { recursive: true });

    if (judge.command !== undefined) {
      const result = await runProcess({
        command: judge.command.map((argument) =>
          argument.startsWith("./") ? path.join(experiment.directory, argument) : argument,
        ),
        input: JSON.stringify(request),
        workingDirectory: experiment.directory,
        environment: namedEnvironment({ source: process.env, names: Object.keys(process.env) }),
        timeoutSeconds: experiment.timeoutSeconds,
      });

      return answerOf({ result, text: result.status === "exited" ? result.stdout : null });
    }

    const program = agentProgram({
      agent: judge.agent ?? "claude-code",
      request: {
        protocol: protocolVersion,
        kind: "subject",
        task: { id: request.task.id, prompt: judgePrompt(request) },
        arm: { name: "judge", flags: judge.flags, model: judge.model },
        workspace: paths.workspace,
        home: paths.home,
        timeoutSeconds: experiment.timeoutSeconds,
      },
    });

    for (const [destination, source] of Object.entries(experiment.auth.files)) {
      const origin = source.startsWith("~/")
        ? path.join(process.env.HOME ?? "", source.slice(2))
        : path.resolve(experiment.directory, source);

      await Bun.write(path.join(paths.home, destination), Bun.file(origin));
    }

    const result = await hostSandbox.run({
      name: "agent-evals-judge",
      command: program.command,
      input: program.input,
      paths,
      environment: namedEnvironment({ source: process.env, names: experiment.passEnv }),
      timeoutSeconds: experiment.timeoutSeconds,
    });
    const response = program.read(result);

    return response.status === "completed"
      ? answerOf({ result, text: response.output })
      : { status: "failed", detail: response.detail ?? `the judge ended with ${response.status}` };
  };
}

export async function entryFiles(options: {
  readonly workspace: string;
  readonly include: readonly string[];
}): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  let total = 0;

  for (const pattern of options.include) {
    const names: string[] = [];

    for await (const name of new Bun.Glob(pattern).scan({
      cwd: options.workspace,
      onlyFiles: true,
    })) {
      names.push(name);
    }

    for (const name of names.sort()) {
      const text = (await Bun.file(path.join(options.workspace, name)).text()).slice(
        0,
        fileCharacterLimit,
      );

      if (files[name] === undefined && total + text.length <= totalCharacterLimit) {
        files[name] = text;
        total += text.length;
      }
    }
  }

  return files;
}

export function pairwisePreference(options: {
  readonly answer: unknown;
  readonly candidateLabel: "A" | "B";
}): number | null {
  const parsed = pairwiseAnswerSchema.safeParse(options.answer);

  if (!parsed.success) {
    return null;
  }

  if (parsed.data.winner === "tie") {
    return 0.5;
  }

  return parsed.data.winner === options.candidateLabel ? 1 : 0;
}

export function rubricPass(answer: unknown): number | null {
  const parsed = rubricAnswerSchema.safeParse(answer);

  return parsed.success ? Number(parsed.data.pass) : null;
}
