import { auditRecords, type AuditCheck } from "@agent-evals/audit";
import type { RunRecord } from "@agent-evals/records";
import { holmAdjusted, type Interval } from "@agent-evals/statistics";
import {
  compareArms,
  planPower,
  type ArmPair,
  type Comparison,
  type ComparisonSettings,
  type PowerPlan,
} from "@agent-evals/verdict";
import { summarizeArm, type ArmSummary } from "./arms";

export type SecondaryComparison = {
  readonly metric: string;
  readonly difference: Interval;
  readonly pValue: number;
  readonly adjustedPValue: number;
};

export type Report = {
  readonly settings: ComparisonSettings;
  readonly primary: Comparison;
  readonly power: PowerPlan | null;
  readonly secondary: readonly SecondaryComparison[];
  readonly arms: readonly ArmSummary[];
  readonly audit: readonly AuditCheck[];
};

export type ReportQuestion = {
  readonly records: readonly RunRecord[];
  readonly arms: ArmPair;
  readonly metric: string;
  readonly settings: ComparisonSettings;
};

export function metricsOf(records: readonly RunRecord[]): string[] {
  return [...new Set(records.flatMap((record) => Object.keys(record.scores)))].sort();
}

function secondaryComparisons(question: ReportQuestion): SecondaryComparison[] {
  const comparisons = metricsOf(question.records)
    .filter((metric) => metric !== question.metric)
    .flatMap((metric) => {
      const comparison = compareArms({ ...question, metric });

      return comparison === "no-shared-task" ? [] : [comparison];
    });
  const adjusted = holmAdjusted(comparisons.map((comparison) => comparison.pValue));

  return comparisons.map((comparison, position) => ({
    metric: comparison.metric,
    difference: comparison.difference,
    pValue: comparison.pValue,
    adjustedPValue: adjusted[position] ?? Number.NaN,
  }));
}

export function buildReport(question: ReportQuestion): Report | "no-shared-task" {
  const primary = compareArms(question);

  if (primary === "no-shared-task") {
    return primary;
  }

  return {
    settings: question.settings,
    primary,
    power:
      primary.verdict === "not-conclusive"
        ? planPower({ sample: primary.sample, settings: question.settings })
        : null,
    secondary: secondaryComparisons(question),
    arms: [question.arms.baseline, question.arms.candidate].map((arm) =>
      summarizeArm({ records: question.records, arm }),
    ),
    audit: auditRecords(question),
  };
}
