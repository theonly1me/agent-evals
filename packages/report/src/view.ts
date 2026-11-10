import type { Report } from "./build";
import { formatNumber, formatSigned, pValuePhrase } from "./numbers";
import { evidenceSentence, noteSentences, verdictSentence } from "./sentences";

export type Table = {
  readonly title: string;
  readonly headings: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

export type ReportView = {
  readonly title: string;
  readonly verdict: Report["primary"]["verdict"];
  readonly headline: string;
  readonly evidence: string;
  readonly notes: readonly string[];
  readonly tables: readonly Table[];
};

const statusLabels = {
  passed: "passed",
  failed: "failed",
  "not-checked": "not checked",
} as const;

function auditTable(report: Report): Table {
  return {
    title: "Validity audit",
    headings: ["Result", "Check", "Detail"],
    rows: report.audit.map((check) => [statusLabels[check.status], check.title, check.detail]),
  };
}

function armTable(report: Report): Table {
  return {
    title: "Arms",
    headings: ["Arm", "Runs", "Completed", "Timeouts", "Failed", "Mean seconds", "Cost in USD"],
    rows: report.arms.map((arm) => [
      arm.arm,
      String(arm.runs),
      String(arm.completed),
      String(arm.timeouts),
      String(arm.failures),
      arm.meanDurationSeconds === null ? "" : formatNumber(arm.meanDurationSeconds),
      arm.totalCostUsd === null ? "" : formatNumber(arm.totalCostUsd),
    ]),
  };
}

function secondaryTable(report: Report): Table {
  return {
    title: "Other metrics (descriptive, with the Holm correction)",
    headings: ["Metric", "Difference", "95% interval", "Adjusted p-value"],
    rows: report.secondary.map((comparison) => [
      comparison.metric,
      formatSigned(comparison.difference.estimate),
      `${formatNumber(comparison.difference.lower)} to ${formatNumber(comparison.difference.upper)}`,
      pValuePhrase(comparison.adjustedPValue),
    ]),
  };
}

export function viewOf(report: Report): ReportView {
  const { arms, metric } = report.primary;
  const tables = [auditTable(report), armTable(report), secondaryTable(report)];

  return {
    title: `${arms.candidate} against ${arms.baseline} on ${metric}`,
    verdict: report.primary.verdict,
    headline: verdictSentence(report),
    evidence: evidenceSentence(report),
    notes: noteSentences(report),
    tables: tables.filter((table) => table.rows.length > 0),
  };
}
