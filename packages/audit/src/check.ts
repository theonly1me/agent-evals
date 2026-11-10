import type { RunRecord } from "@agent-evals/records";

export const checkStatuses = ["passed", "failed", "not-checked"] as const;
export type CheckStatus = (typeof checkStatuses)[number];

export type AuditCheck = {
  readonly id: string;
  readonly title: string;
  readonly status: CheckStatus;
  readonly detail: string;
};

export type ArmNames = {
  readonly baseline: string;
  readonly candidate: string;
};

export type AuditQuestion = {
  readonly records: readonly RunRecord[];
  readonly arms: ArmNames;
};
