# Pull requests, agents, and examples

## Problem

A verdict helps only if a person sees it at the moment of a decision. That moment is the review of a pull request, or a session with a coding agent. A person who must open a terminal and learn a command often does not get the verdict.

A new user also needs proof that one experiment format fits different evaluations, and not only the example of `init`.

## Decision

### A GitHub Action

`action.yml` in the repository root is a composite action. It runs `agent-evals compare` from the npm package on result files that an earlier step made. It writes the Markdown report to the job summary, and it posts the report as one comment on the pull request. A later run updates that comment and does not add a new one.

- The action passes each input to the script as an environment variable. No input reaches a shell command as text.
- The outputs are `verdict` and the path of the report, so a later step can fail the job on `worse`.
- The action does not run an experiment. A run of a real agent needs a login and a budget, and the workflow of the user must own both.

### An agent skill

`skills/agent-evals/SKILL.md` tells a coding agent when to use agent-evals and how. The agent reads saved results with `compare`, or it writes an experiment and runs it. The skill has the rules that keep an answer true: give the verdict line, never guess the baseline, and ask before a paid run.

### Three examples

- `examples/no-comments`: a study with an agent subject, a grader with hidden tests, and two blind pairwise judges. Design record 007 describes the judges.
- `examples/code-review`: the published results of code-review-bench as run records. It shows `compare` on a benchmark that agent-evals did not run, with the pull request as the task.
- `examples/agent-experience`: two versions of the documentation of a tool as the arms. It shows how to test if a product is easy for an agent to use.

## Consequences

- The action needs Node on the runner, and it downloads the package from npm for each run.
- The examples with a real agent have no results in the repository until someone runs them with a paid model.
- The skill is a file in this repository. A user installs it by a copy of the folder.

## Verification

- CI runs the action on `examples/quick-start/runs.jsonl` and checks that the verdict is `better`.
- `examples/code-review/example.test.ts` compares the totals of the run records with the totals that the benchmark published.
- `examples/agent-experience/example.test.ts` runs the experiment with a scripted subject in place of the agent.
- `examples/no-comments/example.test.ts` runs the grader on the reference solution and on the seed code.
