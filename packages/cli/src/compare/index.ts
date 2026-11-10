import { buildReport, metricsOf, renderReport } from "@agent-evals/report";
import { defaultComparisonSettings } from "@agent-evals/verdict";
import { failed, succeeded, type CommandOutcome } from "../outcome";
import { compareUsage, parseCompareArguments, type CompareRequest } from "./arguments";
import { loadResults } from "./load";

function chooseMetric(options: {
  readonly request: CompareRequest;
  readonly available: readonly string[];
}): { readonly metric: string } | { readonly problem: string } {
  const { request, available } = options;
  const listed = `The metrics are: ${available.join(", ")}.`;
  const [onlyMetric, ...otherMetrics] = available;

  if (request.metric !== undefined) {
    return available.includes(request.metric)
      ? { metric: request.metric }
      : { problem: `No run has the metric "${request.metric}". ${listed}` };
  }

  if (onlyMetric === undefined) {
    return { problem: "No run has a score." };
  }

  return otherMetrics.length === 0
    ? { metric: onlyMetric }
    : { problem: `Name the metric to compare with --metric. ${listed}` };
}

export async function runCompare(argumentList: readonly string[]): Promise<CommandOutcome> {
  const parsed = parseCompareArguments(argumentList);

  if (parsed.status === "rejected") {
    return failed(`${parsed.problem}\n\n${compareUsage}`);
  }

  const { request } = parsed;
  const loaded = await loadResults(request);

  if (loaded.status === "rejected") {
    return failed(loaded.problem);
  }

  const chosen = chooseMetric({ request, available: metricsOf(loaded.records) });

  if ("problem" in chosen) {
    return failed(chosen.problem);
  }

  const report = buildReport({
    records: loaded.records,
    arms: loaded.arms,
    metric: chosen.metric,
    settings: {
      ...defaultComparisonSettings,
      higherIsBetter: request.higherIsBetter,
      targetEffect: request.targetEffect,
      resample: {
        ...defaultComparisonSettings.resample,
        seed: request.seed ?? defaultComparisonSettings.resample.seed,
      },
    },
  });

  if (report === "no-shared-task") {
    return failed(
      `No task has a "${chosen.metric}" score in both ${loaded.arms.baseline} and ${loaded.arms.candidate}.`,
    );
  }

  const rendered = renderReport({ report, format: request.format });

  if (request.output === undefined) {
    return succeeded(rendered);
  }

  await Bun.write(request.output, rendered);

  return succeeded(
    `${renderReport({ report, format: "text" }).split("\n\n")[0]}\n\nWrote ${request.output}\n`,
  );
}
