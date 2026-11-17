import { balanceCheck } from "./balance";
import { designCheck } from "./design";
import type { AuditCheck, AuditQuestion } from "./check";
import { failureCheck } from "./failures";
import { versionCheck } from "./versions";

export {
  type ArmNames,
  type AuditCheck,
  type AuditQuestion,
  type CheckStatus,
  checkStatuses,
} from "./check";

const runnerOnlyChecks = [
  { id: "isolation", title: "No run could read the settings of the user" },
  { id: "judge-order", title: "Each judge saw each pair in both orders" },
] as const;

export function auditRecords(question: AuditQuestion): readonly AuditCheck[] {
  return [
    balanceCheck(question),
    failureCheck(question),
    versionCheck(question),
    designCheck(question),
    ...runnerOnlyChecks.map((check) => ({
      ...check,
      status: "not-checked" as const,
      detail: "Only the agent-evals runner records this check. These results do not carry it.",
    })),
  ];
}
