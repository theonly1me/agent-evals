import path from "node:path";
import { z } from "zod";

const runSchema = z.object({
  arm: z.string(),
  caseId: z.string(),
  repeat: z.number().int().positive(),
  status: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  costUsd: z.number().nullable().optional(),
});

const findingSchema = z.object({ id: z.string(), arm: z.string(), repeat: z.number().int() });

const answerSchema = z.object({
  judge: z.string(),
  output: z
    .object({
      findings: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
      detected: z
        .array(z.object({ defect: z.string(), findings: z.array(z.string()) }))
        .default([]),
    })
    .nullable(),
});

const judgedSchema = z.object({
  caseId: z.string(),
  findings: z.array(findingSchema),
  answers: z.array(answerSchema),
});

const caseSchema = z.object({ id: z.string(), defects: z.array(z.object({ id: z.string() })) });

type Judged = z.infer<typeof judgedSchema>;

function agreedIds(options: {
  readonly judged: Judged;
  readonly pick: (output: NonNullable<Judged["answers"][number]["output"]>) => readonly string[];
}): ReadonlySet<string> {
  const [first, second] = options.judged.answers.map(
    (answer) => new Set(answer.output === null ? [] : options.pick(answer.output)),
  );

  return new Set([...(first ?? [])].filter((id) => second?.has(id)));
}

async function readJson(file: string): Promise<unknown> {
  return Bun.file(file).json();
}

export async function convertResults(resultsFolder: string): Promise<readonly object[]> {
  const runs = z.array(runSchema).parse(await readJson(path.join(resultsFolder, "runs.json")));
  const judged = z
    .array(judgedSchema)
    .parse(await readJson(path.join(resultsFolder, "judged.json")));
  const cases = z.array(caseSchema).parse(await readJson(path.join(resultsFolder, "cases.json")));
  const defectCases = new Set(
    cases.filter((item) => item.defects.length > 0).map((item) => item.id),
  );
  const judgedByCase = new Map(judged.map((item) => [item.caseId, item]));

  return runs.map((run) => {
    const caseJudged = judgedByCase.get(run.caseId);
    const ownIds = new Set(
      (caseJudged?.findings ?? [])
        .filter((finding) => finding.arm === run.arm && finding.repeat === run.repeat)
        .map((finding) => finding.id),
    );
    const real = caseJudged
      ? agreedIds({
          judged: caseJudged,
          pick: (output) =>
            output.findings.filter((finding) => finding.label === "real").map(({ id }) => id),
        })
      : new Set<string>();
    const detecting = caseJudged
      ? agreedIds({
          judged: caseJudged,
          pick: (output) => output.detected.flatMap((entry) => entry.findings),
        })
      : new Set<string>();
    const count = (ids: ReadonlySet<string>) => [...ownIds].filter((id) => ids.has(id)).length;
    const seconds = (Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000;

    return {
      task: run.caseId,
      arm: run.arm,
      repeat: run.repeat - 1,
      status: run.status === "done" ? "completed" : "infra-failure",
      scores: {
        findings: ownIds.size,
        real_findings: count(real),
        ...(defectCases.has(run.caseId) ? { defect_found: count(detecting) > 0 ? 1 : 0 } : {}),
      },
      durationSeconds: seconds,
      ...(typeof run.costUsd === "number" ? { costUsd: run.costUsd } : {}),
    };
  });
}

if (import.meta.main) {
  const [resultsFolder, output = path.join(import.meta.dir, "runs.jsonl")] = Bun.argv.slice(2);

  if (resultsFolder === undefined) {
    console.error("Usage: bun examples/code-review/convert.ts <results folder> [output file]");
    process.exitCode = 1;
  } else {
    const records = await convertResults(resultsFolder);

    await Bun.write(output, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
    console.log(`Wrote ${records.length} run records to ${output}`);
  }
}
