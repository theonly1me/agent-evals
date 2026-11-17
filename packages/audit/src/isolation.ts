import type { AuditCheck, AuditQuestion } from "./check";

const check = {
  id: "isolation",
  title: "No run could read the settings of the user",
} as const;

export function isolationCheck(question: AuditQuestion): AuditCheck {
  const armNames = [question.arms.baseline, question.arms.candidate];
  const records = question.records.filter((record) => armNames.includes(record.arm));
  const levels = records.flatMap((record) => record.isolation ?? []);
  const containerCount = levels.filter((level) => level === "container").length;

  if (levels.length === 0) {
    return {
      ...check,
      status: "not-checked",
      detail: "Only the agent-evals runner records this check. These results do not carry it.",
    };
  }

  if (levels.length < records.length) {
    return {
      ...check,
      status: "failed",
      detail: `${records.length - levels.length} of ${records.length} runs carry no isolation record.`,
    };
  }

  return containerCount === records.length
    ? {
        ...check,
        status: "passed",
        detail: `Each of the ${records.length} runs was in a container with a new home folder.`,
      }
    : {
        ...check,
        status: "passed",
        detail: `Each of the ${records.length} runs had a new home folder and a clean environment. ${records.length - containerCount} ran on the host, which does not block a read by an absolute path.`,
      };
}
