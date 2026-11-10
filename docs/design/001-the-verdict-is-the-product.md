# The verdict is the product

## Problem

A person changes an agent setup: a skill, an instruction file, a prompt, a model, or a tool. The person then needs to know if the change helped. The harnesses that we surveyed on 2026-11-10 print means and deltas. None gives a paired test, a count of the runs still needed, or a rule to stop. A reported difference is often smaller than the noise between runs.

## Decision

The product is one verdict for each comparison: better, worse, or not conclusive. A verdict that is not conclusive gives the number of units still needed.

- **Unit of analysis.** The task is the unit. Each task gives one difference: the mean score of the candidate arm minus the mean score of the baseline arm. With one task, the unit is the run, and the comparison says that the result does not generalize across tasks.
- **Interval.** A percentile bootstrap of the task differences, with 10,000 rounds and a fixed seed.
- **Test.** A two-sided sign-flip permutation test on the task differences. The test counts every assignment when their number is at most the round count.
- **Verdict rule.** Better or worse needs a p-value below alpha and an interval that excludes zero. The default alpha is 0.05.
- **Power.** The plan draws new experiments from the observed units, moves them to the target difference, and applies the verdict rule to each one. It reports the smallest unit count that reaches 80% power, with a margin of two standard errors of the simulation. When the normal approximation asks for more than 60 units, it, and the plan names the method that it used.
- **Reproducible numbers.** The generator matches Python `random.Random`, and the sums match Python `fsum` and `sum`. A saved Python analysis is the parity fixture.

The packages follow this order: `statistics` holds methods on plain numbers, `records` holds the run record, and `verdict` joins them.

## Consequences

- The normal approximation alone is too optimistic for this rule. It gave 29 tasks for a case where the real rule reached 71% power, so the plan uses a simulation.
- An experiment with few tasks cannot reach a verdict. Five tasks give a smallest p-value of 0.0625. The power answer tells the user to add tasks.
- The verdict rule is conservative, because it needs both the test and the interval.
- The statistics do not depend on the runner, so the same code can judge records from another harness.

## Verification

- `packages/statistics/src/parity.test.ts` compares the generator, the intervals, and the sign-flip test with a saved Python analysis. Every number must be equal.
- `packages/verdict/src/simulation.test.ts` runs 2,000 experiments with no true difference. At most 5% can get a verdict of better or worse. The measured rate is 3%.
- The same file sizes an experiment with the power plan. At least 80% of those experiments must find the true difference. The measured rate is 80.8% of 500 experiments.
