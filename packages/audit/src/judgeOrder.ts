import type { AuditCheck, AuditQuestion } from "./check";

const check = {
  id: "judge-order",
  title: "Each judge saw each pair in both orders",
} as const;
const bothOrders = 2;

export function judgeOrderCheck(question: AuditQuestion): AuditCheck {
  const armNames = [question.arms.baseline, question.arms.candidate];
  const orders = question.records
    .filter((record) => armNames.includes(record.arm))
    .flatMap((record) => record.judgeOrders ?? []);
  const oneOrderCount = orders.filter((count) => count < bothOrders).length;

  if (orders.length === 0) {
    return {
      ...check,
      status: "not-checked",
      detail: "No run carries a score from a pairwise judge of the agent-evals runner.",
    };
  }

  return oneOrderCount === 0
    ? {
        ...check,
        status: "passed",
        detail: `The pairwise judge saw the pair of each of the ${orders.length} judged runs in both orders.`,
      }
    : {
        ...check,
        status: "failed",
        detail: `${oneOrderCount} of ${orders.length} judged runs had one order only, so the position of an entry can change the score.`,
      };
}
