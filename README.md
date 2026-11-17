# agent-evals

The experiment harness for coding agents. It answers one question: did this change make the agent better, and is the difference real?

You change a skill, an instruction file, a prompt, a model, or a tool. agent-evals compares the runs before and after the change. It gives one verdict: better, worse, or not conclusive. If the verdict is not conclusive, it tells you how many more tasks you need.

**Status:** the `compare` command gives a verdict on saved results. The runner starts a command, Claude Code, or Codex, on the host or in Docker. The tests of the agent subjects use stand-in programs. The examples with a real agent have no results in this repository yet.

## Compare two sets of results

agent-evals reads the results that you already have:

- a Harbor job folder
- an Inspect AI log dump (`inspect log dump`)
- a promptfoo JSON output
- a JSONL file of [run records](packages/records/AGENTS.md)

```bash
npx @theonly1me/agent-evals compare <baseline results> <candidate results>
```

The command needs only Node. To see a verdict before you use your own results, get the example records:

```bash
curl -fsSLO https://raw.githubusercontent.com/theonly1me/agent-evals/main/examples/quick-start/runs.jsonl
npx @theonly1me/agent-evals compare runs.jsonl --baseline without-skill
```

```text
with-skill is better than without-skill on passed.
Difference: +0.208 (95% interval 0.056 to 0.361, p = 0.029) over 24 tasks. without-skill: 0.403. with-skill: 0.611.
```

The report also has a validity audit. It shows which checks passed, which failed, and which nobody made. The [quick start example](examples/quick-start/README.md) describes the records in this run. If one file holds both arms, name the baseline arm with `--baseline`. With two result sets, the first location is the baseline.

## Run an experiment

An experiment is a folder with an `experiment.yaml` file. It names the arms, the tasks, the subject, and the grader. This example needs no model and no login:

```bash
npx @theonly1me/agent-evals init my-experiment
npx @theonly1me/agent-evals freeze my-experiment
npx @theonly1me/agent-evals run my-experiment
```

- **`freeze` records the design.** If the metric, a task, or an input file changes later, `run` stops and names the change.
- **The order is random.** A seed mixes the tasks and the order of the arms, so no arm always runs first.
- **The grader is blind.** It gets the task and the workspace, and never the arm.
- **Each run is separate.** The subject gets a new workspace, a new home folder, and only the environment variables that you name. A probe checks this before the first run.
- **It stops when the answer is clear.** `looks` names the task counts at which the runner tests the result. The 5% level is split across the analyses, so an early stop stays valid.
- **Judges are blind and see both orders.** A pairwise judge compares the two arms on one task as entry A and entry B, then with the entries swapped.
- **The subject is a command or an agent.** `subject: { agent: claude-code }` and `subject: { agent: codex }` start the agent on the host or in Docker.

[Design record 005](docs/design/005-the-experiment-core.md) describes the experiment file and the process protocol. [Design record 006](docs/design/006-sandboxes-and-agent-subjects.md) describes the sandboxes and the agent subjects. [Design record 007](docs/design/007-judges-and-the-stop-rule.md) describes the judges and the stop rule.

## In a pull request

The GitHub Action posts the verdict as one comment on the pull request, and it updates that comment on each run.

```yaml
- uses: theonly1me/agent-evals@v0.3.0
  with:
    results: results/main.jsonl
    candidate-results: results/pull-request.jsonl
```

The workflow needs the permission `pull-requests: write`. The output `verdict` is `better`, `worse`, or `not-conclusive`.

## In a coding agent

[`skills/agent-evals`](skills/agent-evals/SKILL.md) is a skill for Claude Code and Codex. Copy the folder into the skills folder of your agent. The agent then compares results or writes an experiment when you ask if a change helped.

## Examples

| Example                                                 | What it shows                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [quick-start](examples/quick-start/README.md)           | A verdict on saved results in one command.                                                           |
| [code-review](examples/code-review/README.md)           | A verdict on the published results of a code review benchmark. One published lead is not conclusive. |
| [agent-experience](examples/agent-experience/README.md) | Two versions of the documentation of a tool as the arms.                                             |
| [no-comments](examples/no-comments/README.md)           | A study with an agent, hidden tests, and two blind judges.                                           |

## What agent-evals checks

| Question                                       | What agent-evals does                                                                                                  | Test                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Is the difference real?                        | A permutation test and a bootstrap interval, with the task as the unit.                                                | `packages/verdict/src/simulation.test.ts`  |
| How many tasks do I need?                      | A simulation of the same verdict rule gives the number.                                                                | `packages/verdict/src/power.test.ts`       |
| Did the design change after the first results? | `freeze` records the design and each input file. `run` stops on a change.                                              | `packages/experiment/src/lock.test.ts`     |
| Can I stop early?                              | Looks that the freeze records, with the 5% level split across the analyses.                                            | `packages/experiment/src/looks.test.ts`    |
| Did the order of the runs favor an arm?        | A seed mixes the tasks and the order of the arms.                                                                      | `packages/experiment/src/schedule.test.ts` |
| Did the grader or the judge know the arm?      | No request holds the arm. A pairwise judge sees both orders.                                                           | `packages/experiment/src/judging.test.ts`  |
| Did a run read my settings?                    | A new home folder and a clean environment for each run, in Docker if you want. A probe checks it before the first run. | `packages/experiment/src/sandbox.test.ts`  |
| Did a failed run count as a 0?                 | A failed run has no score, and the audit compares the failure rates.                                                   | `packages/experiment/src/runner.test.ts`   |
| Can I use the results that I have?             | Importers for Harbor, Inspect AI, promptfoo, and JSONL.                                                                | `packages/importers/src`                   |

This comes from a survey of public documentation in November 2026. Harbor, Inspect AI, and promptfoo did not describe a paired test, a power analysis, or a frozen design.

## How the verdict works

- **The task is the unit.** Three repeats of one task are not three pieces of evidence. Each task gives one difference.
- **Two conditions for a verdict.** A permutation test must give a p-value below 0.05, and the 95% interval must exclude zero.
- **A power answer.** A simulation of the same rule gives the number of tasks that you need.
- **A failed run has no score.** An infrastructure failure never becomes a 0.
- **The same results give the same report.** Every method takes a seed.

[Design record 001](docs/design/001-the-verdict-is-the-product.md) gives the methods and their tests. See the [documentation](docs/README.md) for the architecture.

## License

MIT OR Apache-2.0
