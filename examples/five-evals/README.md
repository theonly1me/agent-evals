# Five evals example

Five experiments with real agents. Each one asks a question that a team asks before it changes an agent setup.

| Experiment                                               | Question                                                                   | Arms                                          | Agent                   | Main metric               |
| -------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- | ----------------------- | ------------------------- |
| [aa-control](aa-control/experiment.yaml)                 | Two identical setups: does the harness find a difference that is not real? | `sonnet-a`, `sonnet-b`                        | Sonnet 5.5, high effort | `passed`                  |
| [model-choice](model-choice/experiment.yaml)             | Is Opus 5.5 at medium effort better than Sonnet 5.5 at high effort?        | `sonnet-high`, `opus-medium`                  | both                    | `passed`                  |
| [test-first-skill](test-first-skill/experiment.yaml)     | Does a skill that writes tests first help?                                 | `no-skill`, `test-first-skill`                | Sonnet 5.5, high effort | `passed`                  |
| [no-comments-judged](no-comments-judged/experiment.yaml) | If you ban comments, is the code easier to read?                           | `comments-allowed`, `comments-banned`         | Opus 5.5, medium effort | `readability-fable-judge` |
| [docs-regression](docs-regression/experiment.yaml)       | Does a README with old option names break the agent?                       | `full-readme`, `short-readme`, `stale-readme` | Sonnet 5.5, high effort | `correct`                 |

## Tasks

The first four experiments use the 34 Python tasks of the aider polyglot benchmark, in the version of the Harbor registry. `fetchTasks.ts` downloads them from harbor-datasets at a fixed commit into `shared/tasks`. The tasks are not in this repository, because their test files ask that they stay out of training data.

- The prompt of a task is its `instruction.md`, with no change.
- The workspace is the starting file of the exercise. The encrypted reference solution of Harbor is not in the workspace.
- `shared/grade.py` copies the hidden tests into the workspace, runs only those tests, and removes them. `passed` is 1 when every hidden test passes.
- The grader gives each reference solution `passed = 1` and each starting file `passed = 0`, for all 34 tasks.

`docs-regression` uses the 8 tasks of the [agent experience example](../agent-experience/README.md). The `stale-readme` arm documents option names that the tool does not have. The tool ignores an unknown option, so a wrong answer has no error message.

## Judges

Each experiment has a judge: Claude Fable 5.2 at medium effort. A pairwise judge sees the two solutions of one task in both orders. The first three experiments judge the quality of the solution files. `no-comments-judged` judges copies of the files with the comments removed. The judge of `docs-regression` checks that the final message of the agent reports the same result that `answer.txt` holds.

## Run it

The agents need a login. Make a token with `claude setup-token`, and pass it as `CLAUDE_CODE_OAUTH_TOKEN`. The grader needs Python 3 with `pytest`.

```bash
bun examples/five-evals/fetchTasks.ts
agent-evals freeze examples/five-evals/aa-control
agent-evals run examples/five-evals/aa-control --wait-on-limit 15
```

Run the experiments in a copy outside this checkout. The store of a run holds transcripts, and this repository must not hold them, even in ignored files.

## Limits

- Each task runs one time in each arm. The task is the unit, so 34 tasks give one difference each.
- The tasks are public, and the models probably saw the exercises in training.
- The runs use the host sandbox, so the agent gets a new home folder but can read other files on the machine.
- No result is in this folder yet.
