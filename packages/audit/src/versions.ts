import type { AuditCheck, AuditQuestion } from "./check";

type VersionValues = Map<string, Set<string>>;

function versionsOf(options: AuditQuestion & { readonly arm: string }): VersionValues {
  const values: VersionValues = new Map();

  for (const record of options.records) {
    if (record.arm !== options.arm) {
      continue;
    }

    for (const [name, value] of Object.entries(record.versions ?? {})) {
      values.set(name, (values.get(name) ?? new Set()).add(value));
    }
  }

  return values;
}

function mixedNames(values: VersionValues): string[] {
  return [...values.entries()].filter(([, seen]) => seen.size > 1).map(([name]) => name);
}

function differingNames(options: {
  readonly baseline: VersionValues;
  readonly candidate: VersionValues;
}): string[] {
  const names = new Set([...options.baseline.keys(), ...options.candidate.keys()]);

  return [...names]
    .filter((name) => {
      const baseline = [...(options.baseline.get(name) ?? [])].sort().join(",");
      const candidate = [...(options.candidate.get(name) ?? [])].sort().join(",");

      return baseline !== candidate;
    })
    .sort();
}

export function versionCheck(question: AuditQuestion): AuditCheck {
  const baseline = versionsOf({ ...question, arm: question.arms.baseline });
  const candidate = versionsOf({ ...question, arm: question.arms.candidate });
  const check = { id: "stable-versions", title: "No version changed inside an arm" };

  if (baseline.size === 0 && candidate.size === 0) {
    return { ...check, status: "not-checked", detail: "The records carry no versions." };
  }

  const mixed = [...new Set([...mixedNames(baseline), ...mixedNames(candidate)])].sort();

  if (mixed.length > 0) {
    return {
      ...check,
      status: "failed",
      detail: `These versions changed inside one arm: ${mixed.join(", ")}.`,
    };
  }

  const differing = differingNames({ baseline, candidate });

  return {
    ...check,
    status: "passed",
    detail:
      differing.length === 0
        ? "Both arms used the same versions."
        : `The arms differ in: ${differing.join(", ")}.`,
  };
}
