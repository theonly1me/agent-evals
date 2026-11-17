# Design records

Each record states a problem, the decision, its consequences, and how to verify it. Use the [template](template.md) for a new record.

| Record                                     | Decision                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [001](001-the-verdict-is-the-product.md)   | The verdict on a change is the product, and the task is the unit.                                    |
| [002](002-results-from-other-harnesses.md) | agent-evals reads the result files of other harnesses and never starts them.                         |
| [003](003-distribution.md)                 | One npm package with a bundle and a Node launcher, released from CI.                                 |
| [004](004-repository-checks.md)            | The checks of shadowclone, with a 500 line limit and a privacy check of the full checkout.           |
| [005](005-the-experiment-core.md)          | The runner: a frozen design, a seeded schedule, overlays for arms, and a blind grader.               |
| [006](006-sandboxes-and-agent-subjects.md) | A host and a Docker sandbox, a canary probe before each run, and subjects for Claude Code and Codex. |
| [007](007-judges-and-the-stop-rule.md)     | Blind judges with both orders for a pair, and a stop rule at the registered looks.                   |
