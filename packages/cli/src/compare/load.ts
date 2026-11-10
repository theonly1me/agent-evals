import { armNameOf, importRunRecords } from "@agent-evals/importers";
import type { RunRecord } from "@agent-evals/records";
import type { ArmPair } from "@agent-evals/verdict";
import type { CompareRequest } from "./arguments";

export type LoadedResults =
  | { readonly status: "loaded"; readonly records: readonly RunRecord[]; readonly arms: ArmPair }
  | { readonly status: "rejected"; readonly problem: string };

function rejected(problem: string): LoadedResults {
  return { status: "rejected", problem };
}

async function loadTwoLocations(locations: readonly [string, string]): Promise<LoadedResults> {
  const [baselineLocation, candidateLocation] = locations;
  const names = [armNameOf(baselineLocation), armNameOf(candidateLocation)];
  const hasDistinctNames = names[0] !== names[1];
  const arms = {
    baseline: hasDistinctNames ? (names[0] ?? "baseline") : "baseline",
    candidate: hasDistinctNames ? (names[1] ?? "candidate") : "candidate",
  };
  const baseline = await importRunRecords({ location: baselineLocation });
  const candidate = await importRunRecords({ location: candidateLocation });

  if (baseline.status === "rejected") {
    return rejected(baseline.problem);
  }

  if (candidate.status === "rejected") {
    return rejected(candidate.problem);
  }

  return {
    status: "loaded",
    arms,
    records: [
      ...baseline.records.map((record) => ({ ...record, arm: arms.baseline })),
      ...candidate.records.map((record) => ({ ...record, arm: arms.candidate })),
    ],
  };
}

function chooseArms(options: {
  readonly request: CompareRequest;
  readonly available: readonly string[];
}): ArmPair | string {
  const { request, available } = options;
  const listed = `The arms are: ${available.join(", ")}.`;

  if (request.baseline === undefined) {
    return `Name the baseline arm with --baseline. ${listed}`;
  }

  const others = available.filter((arm) => arm !== request.baseline);
  const [onlyOther, ...moreOthers] = others;
  const candidate = request.candidate ?? (moreOthers.length === 0 ? onlyOther : undefined);

  if (candidate === undefined) {
    return `Name the candidate arm with --candidate. ${listed}`;
  }

  const unknown = [request.baseline, candidate].filter((arm) => !available.includes(arm));

  if (unknown.length > 0 || candidate === request.baseline) {
    return `--baseline and --candidate must name two different arms. ${listed}`;
  }

  return { baseline: request.baseline, candidate };
}

export async function loadResults(request: CompareRequest): Promise<LoadedResults> {
  const [first, second] = request.locations;

  if (second !== undefined) {
    return loadTwoLocations([first, second]);
  }

  const imported = await importRunRecords({ location: first });

  if (imported.status === "rejected") {
    return rejected(imported.problem);
  }

  const available = [...new Set(imported.records.map((record) => record.arm))].sort();
  const arms = chooseArms({ request, available });

  return typeof arms === "string"
    ? rejected(arms)
    : { status: "loaded", records: imported.records, arms };
}
