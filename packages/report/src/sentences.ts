import type { Report } from "./build";
import { formatNumber, formatSigned, pValuePhrase } from "./numbers";

function unitNoun(options: { readonly report: Report; readonly count: number }): string {
  const noun = options.report.primary.sample.unit;

  return options.count === 1 ? noun : `${noun}s`;
}

export function verdictSentence(report: Report): string {
  const { arms, metric, verdict } = report.primary;

  if (verdict === "not-conclusive") {
    return `Not conclusive: the results cannot tell ${arms.candidate} from ${arms.baseline} on ${metric}.`;
  }

  return `${arms.candidate} is ${verdict} than ${arms.baseline} on ${metric}.`;
}

export function evidenceSentence(report: Report): string {
  const { primary } = report;
  const { difference, unitCount } = primary;
  const units = `${unitCount} ${unitNoun({ report, count: unitCount })}`;

  return `Difference: ${formatSigned(difference.estimate)} (95% interval ${formatNumber(difference.lower)} to ${formatNumber(difference.upper)}, ${pValuePhrase(primary.pValue)}) over ${units}. ${primary.arms.baseline}: ${formatNumber(primary.baselineMean)}. ${primary.arms.candidate}: ${formatNumber(primary.candidateMean)}.`;
}

function powerSentences(report: Report): string[] {
  const { power, primary } = report;

  if (power === null) {
    return [];
  }

  const units = unitNoun({ report, count: primary.unitCount });

  if (!(power.minimumDetectableEffect > 0)) {
    return [
      `The ${primary.unitCount} ${units} show no spread, so there is no power answer. Add more ${primary.sample.unit}s.`,
    ];
  }

  const detectable = `With ${primary.unitCount} ${units}, the smallest difference that you can detect is about ${formatNumber(power.minimumDetectableEffect)}.`;

  if (!Number.isFinite(power.unitsNeeded)) {
    return [detectable];
  }

  const needed = `To detect a difference of ${formatNumber(power.targetEffect)} with ${report.settings.power * 100}% power, you need about ${power.unitsNeeded} ${unitNoun({ report, count: power.unitsNeeded })} (${power.additionalUnits} more).`;

  return [needed, detectable];
}

export function noteSentences(report: Report): string[] {
  const { primary, settings } = report;
  const notes = powerSentences(report);

  if (primary.sample.unit === "run") {
    notes.push(
      "This comparison has one task, so the unit is the run. The result does not generalize to other tasks.",
    );
  }

  if (!settings.higherIsBetter) {
    notes.push(`A lower ${primary.metric} is better.`);
  }

  const unmatched = primary.tasksOnlyInBaseline.length + primary.tasksOnlyInCandidate.length;

  if (unmatched > 0) {
    notes.push(`${unmatched} tasks have scores in only one arm and are not in the comparison.`);
  }

  return notes;
}
