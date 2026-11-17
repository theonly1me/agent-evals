import { runStatuses } from "@agent-evals/records";
import { z } from "zod";
import type { ProcessResult } from "./process";

export const protocolVersion = 1;

export type SubjectRequest = {
  readonly protocol: typeof protocolVersion;
  readonly kind: "subject";
  readonly task: { readonly id: string; readonly prompt: string };
  readonly arm: {
    readonly name: string;
    readonly flags: readonly string[];
    readonly model?: string;
  };
  readonly workspace: string;
  readonly home: string;
  readonly timeoutSeconds: number;
};

export type GraderRequest = {
  readonly protocol: typeof protocolVersion;
  readonly kind: "grader";
  readonly task: { readonly id: string; readonly prompt: string };
  readonly workspace: string;
  readonly output: string;
};

const subjectResponseSchema = z.object({
  status: z.enum(runStatuses).default("completed"),
  output: z.string().default(""),
  detail: z.string().optional(),
  costUsd: z.number().nonnegative().optional(),
  versions: z.record(z.string(), z.string()).optional(),
});

const graderResponseSchema = z.object({
  scores: z.record(z.string(), z.number()),
});

export type SubjectResponse = z.infer<typeof subjectResponseSchema>;

export type GraderResponse =
  | { readonly status: "graded"; readonly scores: Readonly<Record<string, number>> }
  | { readonly status: "failed"; readonly detail: string };

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

function failureOf(options: {
  readonly program: string;
  readonly result: ProcessResult;
}): string | null {
  const { program, result } = options;

  if (result.status === "not-started") {
    return `the ${program} did not start: ${result.detail}`;
  }

  if (result.status === "exited" && result.exitCode !== 0) {
    return `the ${program} exited with code ${result.exitCode}: ${lastLines(result.stderr)}`;
  }

  return null;
}

export function readSubjectResponse(result: ProcessResult): SubjectResponse {
  const failure = failureOf({ program: "subject", result });

  if (failure !== null || result.status === "not-started") {
    return { status: "infra-failure", output: "", detail: failure ?? undefined };
  }

  const parsed = subjectResponseSchema.safeParse(parsedJson(result.stdout));

  if (result.status === "timeout") {
    return { status: "timeout", output: parsed.success ? parsed.data.output : result.stdout };
  }

  return parsed.success
    ? parsed.data
    : {
        status: "infra-failure",
        output: "",
        detail: `the subject did not write a JSON response: ${lastLines(result.stdout)}`,
      };
}

export function readGraderResponse(result: ProcessResult): GraderResponse {
  const failure = failureOf({ program: "grader", result });

  if (failure !== null || result.status === "not-started") {
    return { status: "failed", detail: failure ?? "the grader did not start" };
  }

  if (result.status === "timeout") {
    return { status: "failed", detail: "the grader did not finish in time" };
  }

  const parsed = graderResponseSchema.safeParse(parsedJson(result.stdout));

  return parsed.success
    ? { status: "graded", scores: parsed.data.scores }
    : {
        status: "failed",
        detail: `the grader did not write a JSON response with scores: ${lastLines(result.stdout)}`,
      };
}
