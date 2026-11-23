import { z } from "zod";
import type { ProcessResult } from "./process";
import type { SubjectResponse } from "./protocol";
import type { AgentName } from "./spec";
import { isUsageLimit } from "./usageLimit";

const claudeResultSchema = z.object({
  result: z.string().default(""),
  is_error: z.boolean().default(false),
  total_cost_usd: z.number().nonnegative().optional(),
  api_error_status: z.number().nullable().optional(),
});

const codexEventSchema = z.object({
  type: z.string(),
  item: z.object({ type: z.string().optional(), text: z.string().optional() }).optional(),
});

function failure(detail: string): SubjectResponse {
  return { status: "infra-failure", output: "", detail };
}

function claudeFailure(options: {
  readonly detail: string;
  readonly apiErrorStatus?: number | null;
}): SubjectResponse {
  return isUsageLimit({ text: options.detail, apiErrorStatus: options.apiErrorStatus })
    ? { ...failure(options.detail), limited: true }
    : failure(options.detail);
}

function claudeError(options: {
  readonly result: string;
  readonly apiErrorStatus?: number | null;
}): SubjectResponse {
  return claudeFailure({
    detail: `claude-code reported an error: ${lastLines(options.result)}`,
    apiErrorStatus: options.apiErrorStatus,
  });
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

export function readClaude(result: ProcessResult): SubjectResponse {
  const problem = exitProblem({ agent: "claude-code", result });

  if (result.status === "not-started") {
    return failure(problem ?? "claude-code did not start");
  }

  const parsed = claudeResultSchema.safeParse(parsedJson(result.stdout));

  if (problem !== null) {
    return parsed.success && parsed.data.result.length > 0
      ? claudeError({ result: parsed.data.result, apiErrorStatus: parsed.data.api_error_status })
      : claudeFailure({ detail: problem });
  }

  if (result.status === "timeout") {
    return { status: "timeout", output: parsed.success ? parsed.data.result : "" };
  }

  if (!parsed.success) {
    return failure(`claude-code did not write a JSON result: ${lastLines(result.stdout)}`);
  }

  return parsed.data.is_error
    ? claudeError({ result: parsed.data.result, apiErrorStatus: parsed.data.api_error_status })
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

export function readCodex(result: ProcessResult): SubjectResponse {
  const problem = exitProblem({ agent: "codex", result });

  if (problem !== null || result.status === "not-started") {
    return failure(problem ?? "codex did not start");
  }

  return {
    status: result.status === "timeout" ? "timeout" : "completed",
    output: codexMessages(result.stdout),
  };
}
