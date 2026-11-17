import type { AuditCheck, AuditQuestion } from "./check";

const check = {
  id: "frozen-design",
  title: "The design did not change after the first run",
} as const;
const shownDigestLength = 12;

export function designCheck(question: AuditQuestion): AuditCheck {
  const armNames = [question.arms.baseline, question.arms.candidate];
  const records = question.records.filter((record) => armNames.includes(record.arm));
  const digests = new Set(records.flatMap((record) => record.design ?? []));
  const missingCount = records.filter((record) => record.design === undefined).length;
  const [onlyDigest, ...otherDigests] = [...digests];

  if (onlyDigest === undefined) {
    return {
      ...check,
      status: "not-checked",
      detail: "Only the agent-evals runner records this check. These results do not carry it.",
    };
  }

  if (missingCount > 0) {
    return {
      ...check,
      status: "failed",
      detail: `${missingCount} of ${records.length} runs carry no design digest.`,
    };
  }

  return otherDigests.length === 0
    ? {
        ...check,
        status: "passed",
        detail: `Each of the ${records.length} runs carries the frozen design ${onlyDigest.slice(0, shownDigestLength)}.`,
      }
    : {
        ...check,
        status: "failed",
        detail: `The runs carry ${digests.size} different designs, so the design changed between runs.`,
      };
}
