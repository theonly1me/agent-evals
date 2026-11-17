# Code review example

This example gives a verdict on results that another benchmark published. It runs no reviewer and no model.

[code-review-bench](https://github.com/theonly1me/code-review-bench) compared four AI code reviewers on 40 merged pull requests of vite. 13 of them have a known defect. Two judges labeled each finding. The benchmark published its result files in `results/2026-10-vite`.

`runs.jsonl` holds one run record for each of the 320 reviews. `convert.ts` made it from the published files `runs.json`, `judged.json`, and `cases.json`.

- `findings`: the findings of the review.
- `real_findings`: the findings that both judges labeled real.
- `defect_found`: 1 if both judges named the same finding for the known defect. Only the 13 pull requests with a defect have this score.

The task is the pull request. A local reviewer ran three times on each pull request, and a bot ran one time.

## Verdicts

```bash
agent-evals compare examples/code-review/runs.jsonl --baseline shadowclone-cloud --candidate greptile --metric defect_found
```

```text
Not conclusive: the results cannot tell greptile from shadowclone-cloud on defect_found.
Difference: +0.308 (95% interval 0.077 to 0.538, p = 0.125) over 13 tasks. shadowclone-cloud: 0.385. greptile: 0.692.
To detect a difference of 0.308 with 80% power, you need about 25 tasks (12 more).
```

One bot found 9 of 13 known defects, and the other found 5. That is a large difference, but 13 pull requests cannot show that it is real. About 12 more pull requests with a defect can.

```bash
agent-evals compare examples/code-review/runs.jsonl --baseline openqodex --candidate shadowclone --metric real_findings
```

```text
shadowclone is better than openqodex on real_findings.
Difference: +0.125 (95% interval 0.033 to 0.242, p = 0.023) over 40 tasks. openqodex: 0.3. shadowclone: 0.425.
```

This metric has a score on each of the 40 pull requests, and the difference is conclusive.

## Make the records again

```bash
git clone https://github.com/theonly1me/code-review-bench
bun examples/code-review/convert.ts code-review-bench/results/2026-10-vite
```

## Limits

- The audit cannot check how the reviews ran, so the runner checks show as not checked.
- A dispute between the two judges went to a third judge in the benchmark. `real_findings` here counts only the findings that the first two judges both labeled real. The totals are equal to the published totals.
