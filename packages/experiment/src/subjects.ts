import { readClaude, readCodex } from "./agentResults";
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

export function agentProgram(options: {
  readonly agent: AgentName;
  readonly request: SubjectRequest;
  readonly program?: string;
}): SubjectProgram {
  const { agent, request } = options;
  const program = options.program ?? (agent === "claude-code" ? "claude" : "codex");
  const model = request.arm.model === undefined ? [] : ["--model", request.arm.model];

  if (agent === "claude-code") {
    return {
      label: agent,
      command: [
        program,
        "--print",
        request.task.prompt,
        "--output-format",
        "json",
        "--dangerously-skip-permissions",
        ...model,
        ...request.arm.flags,
      ],
      input: "",
      versionCommand: [program, "--version"],
      read: readClaude,
    };
  }

  return {
    label: agent,
    command: [
      program,
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      ...model,
      ...request.arm.flags,
      request.task.prompt,
    ],
    input: "",
    versionCommand: [program, "--version"],
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
    return agentProgram({
      agent: subject.agent,
      request: options.request,
      program: subject.program,
    });
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
