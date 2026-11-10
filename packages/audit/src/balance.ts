import type { AuditCheck, AuditQuestion } from "./check";

function runCountsByTask(options: AuditQuestion & { readonly arm: string }): Map<string, number> {
  const counts = new Map<string, number>();

  for (const record of options.records) {
    if (record.arm === options.arm) {
      counts.set(record.task, (counts.get(record.task) ?? 0) + 1);
    }
  }

  return counts;
}

export function balanceCheck(question: AuditQuestion): AuditCheck {
  const baseline = runCountsByTask({ ...question, arm: question.arms.baseline });
  const candidate = runCountsByTask({ ...question, arm: question.arms.candidate });
  const tasks = new Set([...baseline.keys(), ...candidate.keys()]);
  const unmatched = [...tasks].filter((task) => !baseline.has(task) || !candidate.has(task));
  const uneven = [...tasks].filter(
    (task) =>
      baseline.has(task) && candidate.has(task) && baseline.get(task) !== candidate.get(task),
  );
  const isBalanced = unmatched.length === 0 && uneven.length === 0;

  return {
    id: "balanced-arms",
    title: "Both arms ran the same tasks the same number of times",
    status: isBalanced ? "passed" : "failed",
    detail: isBalanced
      ? `${tasks.size} tasks ran in both arms with equal run counts.`
      : `${unmatched.length} tasks ran in only one arm and are not in the comparison. ${uneven.length} tasks have different run counts.`,
  };
}
