import type { AuditCheck, AuditQuestion } from "./check";

const largestFailureRateGap = 0.1;

type FailureCount = { readonly failed: number; readonly total: number };

function failuresOf(options: AuditQuestion & { readonly arm: string }): FailureCount {
  const runs = options.records.filter((record) => record.arm === options.arm);

  return {
    failed: runs.filter((record) => record.status === "infra-failure").length,
    total: runs.length,
  };
}

function rateOf(count: FailureCount): number {
  return count.total === 0 ? 0 : count.failed / count.total;
}

export function failureCheck(question: AuditQuestion): AuditCheck {
  const baseline = failuresOf({ ...question, arm: question.arms.baseline });
  const candidate = failuresOf({ ...question, arm: question.arms.candidate });
  const gap = Math.abs(rateOf(baseline) - rateOf(candidate));

  return {
    id: "failed-runs",
    title: "Failed runs have no score, and both arms fail at a similar rate",
    status: gap > largestFailureRateGap ? "failed" : "passed",
    detail: `${question.arms.baseline}: ${baseline.failed} of ${baseline.total} runs failed. ${question.arms.candidate}: ${candidate.failed} of ${candidate.total} runs failed. The limit for the gap is ${largestFailureRateGap * 100} points.`,
  };
}
