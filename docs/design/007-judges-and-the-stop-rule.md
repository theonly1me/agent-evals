# Judges and the stop rule

## Problem

Two needs remain after the experiment core.

- Some qualities have no test. Only a model can judge if a review comment is correct or if code is clear. A judge has known faults: it prefers the first entry, and it changes its answer when it knows the arm.
- A user wants to stop when the answer is clear, and not pay for each planned run. But a test after each batch, at the 5% level each time, gives a false verdict much more often than 5%.

## Decision

### Judges

The experiment file has a `judges` list. A judge gives one metric. A judge is a command with the process protocol, or an agent (`claude-code` or `codex`) with a model.

- **A rubric judge** scores one run. It answers pass or fail. With `votes: 3`, it answers three times, and the score is the mean.
- **A pairwise judge** compares the baseline run and the candidate run of one task and one repeat. It sees them as entry A and entry B, and then with the entries swapped. The candidate gets 1 for a win, 0.5 for a tie, and 0 for a loss, and its score is the mean of both orders. The baseline run gets 0.5. Thus the difference is above zero only if the judge prefers the candidate in both positions.

A judge request holds the task, the rubric, the final message of each entry, and the workspace files that `include` names. It never holds an arm.

A judge that fails, or that gives no valid answer, gives no score for its metric. The run keeps its other scores. `maxJudgeCalls` limits the judge calls, and a later run judges only what is missing. The judgments are in `.agent-evals/judgments.jsonl`.

Each record with a pairwise score carries the number of orders. The audit check `judge-order` fails if a judged run had one order.

### The stop rule

`looks` in the experiment file names the task counts at which the runner tests the result, for example `[8, 16]` for 24 tasks. The freeze records them, so nobody can add a look after the first results.

A design with K looks has K + 1 analyses: the looks and the final one. Each analysis uses the level 0.05 / (K + 1). At a look, the runner stops if each comparison with the baseline is conclusive at that level. The final report uses the same level and says so.

This is the Bonferroni split. The chance of a false verdict in any analysis is at most the sum of the levels, which is 5%. It needs no assumption about the data. A method that spends less of the level at early looks has more power. It can replace this rule later with no change to the experiment file.

The interval in the report stays a 95% interval. A verdict needs the stricter p-value and an interval that excludes zero, so the rule is not weaker than before.

### A new dependency edge

`experiment` now depends on `verdict`, because the look uses the same comparison as the final report. One rule decides the verdict at each analysis.

## Consequences

- With looks, the final analysis is stricter than with no looks. The user pays some power for the option to stop early.
- A pairwise judge costs two calls for each pair and each vote.
- A judge reads only the files that `include` names, up to a size limit. A judge of a large change needs a narrow `include`.

## Verification

- `packages/experiment/src/looks.test.ts` simulates 400 experiments with two looks and no true effect. The split rule gives a false verdict in at most 5% of them. The same test shows that the rule with no split gives more false verdicts.
- `packages/experiment/src/judging.test.ts` runs real judge programs. A judge that always prefers the first entry gives a score of 0.5 for each pair. The requests show both orders and no arm name. A judge that fails gives no score.
