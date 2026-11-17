import { z } from "zod";
import type { ProcessResult } from "./process";
import { readSubjectResponse, type SubjectRequest, type SubjectResponse } from "./protocol";
import type { AgentName, Experiment } from "./spec";

export type SubjectProgram = {
  readonly label: string;
  readonly command: readonly string[];
  readonly input: string;
  readonly versionCommand: readonly string[] | null;
  readonly read: (result: ProcessResult) => SubjectResponse;
};

const claudeResultSchema = z.object({
  result: z.string().default(""),
  is_error: z.boolean().default(false),
  total_cost_usd: z.number().nonnegative().optional(),
});

const codexEventSchema = z.object({
  type: z.string(),
  item: z.object({ type: z.string().optional(), text: z.string().optional() }).optional(),
});

function failure(detail: string): SubjectResponse {
  return { status: "infra-failure", output: "", detail };
}

function lastLines(text: string): string {
  return text.trim().split("\n").slice(-3).join(" ").slice(0, 400);
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function exitProblem(options: { readonly agent: AgentName; readonly result: ProcessResult }) {
  const { agent, result } = options;

  if (result.status === "not-started") {
    return `${agent} did not start: ${result.detail}`;
  }

  return result.status === "exited" && result.exitCode !== 0
    ? `${agent} exited with code ${result.exitCode}: ${lastLines(result.stderr || result.stdout)}`
    : null;
}

function readClaude(result: ProcessResult): SubjectResponse {
  const problem = exitProblem({ agent: "claude-code", result });

  if (problem !== null || result.status === "not-started") {
    return failure(problem ?? "claude-code did not start");
  }

  const parsed = claudeResultSchema.safeParse(parsedJson(result.stdout));

  if (result.status === "timeout") {
    return { status: "timeout", output: parsed.success ? parsed.data.result : "" };
  }

  if (!parsed.success) {
    return failure(`claude-code did not write a JSON result: ${lastLines(result.stdout)}`);
  }

  return parsed.data.is_error
    ? failure(`claude-code reported an error: ${lastLines(parsed.data.result)}`)
    : { status: "completed", output: parsed.data.result, costUsd: parsed.data.total_cost_usd };
}

function codexMessages(stdout: string): string {
  return stdout
    .split("\n")
    .map((line) => codexEventSchema.safeParse(parsedJson(line)))
    .flatMap((event) =>
      event.success &&
      event.data.type === "item.completed" &&
      event.data.item?.type === "agent_message"
        ? [event.data.item.text ?? ""]
        : [],
    )
    .join("\n");
}

function readCodex(result: ProcessResult): SubjectResponse {
  const problem = exitProblem({ agent: "codex", result });

  if (problem !== null || result.status === "not-started") {
    return failure(problem ?? "codex did not start");
  }

  return {
    status: result.status === "timeout" ? "timeout" : "completed",
    output: codexMessages(result.stdout),
  };
}

function agentProgram(options: {
  readonly agent: AgentName;
  readonly request: SubjectRequest;
}): SubjectProgram {
  const { agent, request } = options;
  const model = request.arm.model === undefined ? [] : ["--model", request.arm.model];

  if (agent === "claude-code") {
    return {
      label: agent,
      command: [
        "claude",
        "--print",
        request.task.prompt,
        "--output-format",
        "json",
        "--dangerously-skip-permissions",
        ...model,
        ...request.arm.flags,
      ],
      input: "",
      versionCommand: ["claude", "--version"],
      read: readClaude,
    };
  }

  return {
    label: agent,
    command: [
      "codex",
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      ...model,
      ...request.arm.flags,
      request.task.prompt,
    ],
    input: "",
    versionCommand: ["codex", "--version"],
    read: readCodex,
  };
}

export function subjectProgram(options: {
  readonly experiment: Experiment;
  readonly request: SubjectRequest;
  readonly experimentDirectory: string;
}): SubjectProgram {
  const { subject } = options.experiment;

  if ("agent" in subject) {
    return agentProgram({ agent: subject.agent, request: options.request });
  }

  const command = subject.command.map((argument) =>
    argument.startsWith("./") ? `${options.experimentDirectory}/${argument.slice(2)}` : argument,
  );

  return {
    label: subject.command[0] ?? "command",
    command,
    input: JSON.stringify(options.request),
    versionCommand: null,
    read: readSubjectResponse,
  };
}
