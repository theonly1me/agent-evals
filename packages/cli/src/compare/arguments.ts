import { parseArgs } from "node:util";
import { reportFormats, type ReportFormat } from "@agent-evals/report";

export type CompareRequest = {
  readonly locations: readonly [string] | readonly [string, string];
  readonly baseline?: string;
  readonly candidate?: string;
  readonly metric?: string;
  readonly higherIsBetter: boolean;
  readonly targetEffect?: number;
  readonly seed?: number;
  readonly format: ReportFormat;
  readonly output?: string;
};

export type ParsedArguments =
  | { readonly status: "parsed"; readonly request: CompareRequest }
  | { readonly status: "rejected"; readonly problem: string };

export const compareUsage = `Usage:
  agent-evals compare <baseline results> <candidate results> [options]
  agent-evals compare <results> --baseline <arm> [--candidate <arm>] [options]

Results are a Harbor job folder, an Inspect AI log dump, a promptfoo JSON output,
or a JSONL file of run records.

Options:
  --metric <name>        The score to compare. Required when the results have more than one.
  --lower-is-better      A lower score is better.
  --target-effect <n>    The smallest difference that matters, for the power answer.
  --format <format>      text (default), markdown, html, or json.
  --output <file>        Write the report to a file.
  --seed <n>             The seed for the resampling methods.
`;

function rejected(problem: string): ParsedArguments {
  return { status: "rejected", problem };
}

function numberOf(options: { readonly flag: string; readonly text: string | undefined }) {
  if (options.text === undefined) {
    return { status: "absent" as const };
  }

  const value = Number(options.text);

  return Number.isFinite(value)
    ? { status: "given" as const, value }
    : {
        status: "invalid" as const,
        problem: `--${options.flag} needs a number, received "${options.text}".`,
      };
}

function parseFlags(argumentList: readonly string[]) {
  try {
    return parseArgs({
      args: [...argumentList],
      allowPositionals: true,
      options: {
        baseline: { type: "string" },
        candidate: { type: "string" },
        metric: { type: "string" },
        "lower-is-better": { type: "boolean", default: false },
        "target-effect": { type: "string" },
        seed: { type: "string" },
        format: { type: "string", default: "text" },
        output: { type: "string" },
      },
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function parseCompareArguments(argumentList: readonly string[]): ParsedArguments {
  const parsed = parseFlags(argumentList);

  if (typeof parsed === "string") {
    return rejected(parsed);
  }

  const { values, positionals } = parsed;
  const [first, second, ...extra] = positionals;
  const format = reportFormats.find((candidate) => candidate === values.format);
  const targetEffect = numberOf({ flag: "target-effect", text: values["target-effect"] });
  const seed = numberOf({ flag: "seed", text: values.seed });

  if (first === undefined || extra.length > 0) {
    return rejected("Pass one or two result locations.");
  }

  if (format === undefined) {
    return rejected(`--format must be one of: ${reportFormats.join(", ")}.`);
  }

  if (targetEffect.status === "invalid") {
    return rejected(targetEffect.problem);
  }

  if (seed.status === "invalid" || (seed.status === "given" && !Number.isSafeInteger(seed.value))) {
    return rejected("--seed needs a whole number.");
  }

  if (second !== undefined && (values.baseline !== undefined || values.candidate !== undefined)) {
    return rejected(
      "With two result locations, the first is the baseline and the second is the candidate. Remove --baseline and --candidate.",
    );
  }

  return {
    status: "parsed",
    request: {
      locations: second === undefined ? [first] : [first, second],
      baseline: values.baseline,
      candidate: values.candidate,
      metric: values.metric,
      higherIsBetter: !values["lower-is-better"],
      targetEffect: targetEffect.status === "given" ? targetEffect.value : undefined,
      seed: seed.status === "given" ? seed.value : undefined,
      format,
      output: values.output,
    },
  };
}
