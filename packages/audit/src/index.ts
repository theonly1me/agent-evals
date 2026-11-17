import { balanceCheck } from "./balance";
import { designCheck } from "./design";
import type { AuditCheck, AuditQuestion } from "./check";
import { failureCheck } from "./failures";
import { isolationCheck } from "./isolation";
import { judgeOrderCheck } from "./judgeOrder";
import { versionCheck } from "./versions";

export {
  type ArmNames,
  type AuditCheck,
  type AuditQuestion,
  type CheckStatus,
  checkStatuses,
} from "./check";

export function auditRecords(question: AuditQuestion): readonly AuditCheck[] {
  return [
    balanceCheck(question),
    failureCheck(question),
    versionCheck(question),
    designCheck(question),
    isolationCheck(question),
    judgeOrderCheck(question),
  ];
}
