import { expect, test } from "bun:test";
import path from "node:path";
import { runRecordSchema } from "@agent-evals/records";
import { compareArms } from "@agent-evals/verdict";

const publishedTotals = {
  shadowclone: { reviews: 120, findings: 69, real: 51, defectsFound: 14, defectChances: 39 },
  openqodex: { reviews: 120, findings: 52, real: 36, defectsFound: 12, defectChances: 39 },
  "shadowclone-cloud": { reviews: 40, findings: 28, real: 22, defectsFound: 5, defectChances: 13 },
  greptile: { reviews: 40, findings: 43, real: 19, defectsFound: 9, defectChances: 13 },
};

async function records() {
  const text = await Bun.file(path.join(import.meta.dir, "runs.jsonl")).text();

  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => runRecordSchema.parse(JSON.parse(line)));
}

test("the run records give the totals that code-review-bench published", async () => {
  const all = await records();
  const totals = Object.fromEntries(
    Object.keys(publishedTotals).map((arm) => {
      const own = all.filter((record) => record.arm === arm);
      const sum = (metric: string) =>
        own.reduce((total, record) => total + (record.scores[metric] ?? 0), 0);

      return [
        arm,
        {
          reviews: own.length,
          findings: sum("findings"),
          real: sum("real_findings"),
          defectsFound: sum("defect_found"),
          defectChances: own.filter((record) => record.scores.defect_found !== undefined).length,
        },
      ];
    }),
  );

  expect(totals).toEqual(publishedTotals);
});

test("the lead of one bot on known defects is not conclusive over 13 pull requests", async () => {
  const comparison = compareArms({
    records: await records(),
    arms: { baseline: "shadowclone-cloud", candidate: "greptile" },
    metric: "defect_found",
  });

  expect(comparison).toMatchObject({ verdict: "not-conclusive", unitCount: 13 });
  expect(comparison === "no-shared-task" ? 0 : comparison.difference.estimate).toBeCloseTo(
    9 / 13 - 5 / 13,
    10,
  );
});

test("one local reviewer has more real findings for each review, over 40 pull requests", async () => {
  const comparison = compareArms({
    records: await records(),
    arms: { baseline: "openqodex", candidate: "shadowclone" },
    metric: "real_findings",
  });

  expect(comparison).toMatchObject({ verdict: "better", unitCount: 40 });
  expect(comparison === "no-shared-task" ? 0 : comparison.difference.estimate).toBeCloseTo(
    51 / 120 - 36 / 120,
    10,
  );
});
