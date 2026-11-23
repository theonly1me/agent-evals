# The experiment core

## Problem

Release 0.1 gives a verdict on results that another harness made. It cannot check how those results were made. Three faults make a comparison wrong, and no result file shows them:

- The design changes after the first results arrive. A new metric or a removed task can turn noise into a win.
- The arms run in a fixed order, so a slow hour or a rate limit hits one arm more than the other.
- The grader knows the arm, or the subject reads the settings of the person who runs it.

agent-evals needs its own runner, so that it can prevent these faults and prove it in the audit.

## Decision

A new package, `@agent-evals/experiment`, runs an experiment and writes run records. It depends on `records` and `statistics`. The `cli` package gets the commands `init`, `freeze`, and `run`.

### The experiment file

An experiment is a folder with `experiment.yaml` (or `.yml`, or `.json`). The file names the metric, the baseline arm, the arms, the tasks, the subject, and the grader. An unknown key is an error, so a misspelled setting cannot change the design in silence.

An arm is a set of overlays, and each type of change uses the same mechanism:

- `files` copies files into the workspace, for example an instruction file or a skill.
- `home` copies files into the home folder of the run, for example an agent configuration.
- `env`, `flags`, `model`, and `image` reach the subject.

### The freeze

`agent-evals freeze` writes `agent-evals.lock.json`. It holds the design and a SHA-256 digest of each file in the folder. `agent-evals run` computes both again and stops if one differs. The message names the changed files.

The run limit and the cost limit are not part of the design. A user can raise them and continue.

Each run record carries the digest of the design. The audit check `frozen-design` passes only if each record carries the same digest.

### The schedule

The seed gives the order of the tasks. All the runs of one task are together, and the order of the arms is random in each repeat. Thus a look after N tasks sees N complete tasks, and no arm always runs first.

### One run

1. The runner makes a new workspace and a new home folder. The name of the folder is a hash, so a path does not show the arm.
2. It copies the task workspace, then the overlays of the arm.
3. It starts the subject in the workspace. The environment holds only `PATH`, `LANG`, `TMPDIR`, the names in `passEnv`, and the `env` of the arm.
4. It starts the grader in the experiment folder. The grader request has the task, the workspace, and the output of the subject. It does not have the arm.

### The process protocol

A subject and a grader are programs in any language. Each reads one JSON request on standard input and writes one JSON response on standard output. An argument of the command that starts with `./` is a path in the experiment folder.

- The subject response can have `status`, `output`, `costUsd`, and `versions`.
- The grader response has `scores`, a map from a metric name to a number.
- A non-zero exit code, or a response that is not JSON, is an infrastructure failure. The run has no score.
- A subject that passes the time limit is a timeout. The grader still scores the workspace.

### Failures, limits, and resume

The runner retries an infrastructure failure up to `retries` times. Each attempt is one line in `.agent-evals/runs.jsonl`, and each attempt counts against `maxRuns`. A second `run` reads the file and starts only the runs that are missing.

A usage limit of the agent is a different failure. The subject marks it as `limited`, for example when Claude Code reports that the account hit its session limit. The runner records the attempt with no score. That attempt does not use a retry and does not count against `maxRuns` or `maxCostUsd`. The run then stops with the reason `usage-limit`, so a later `run` tries the same cell again. With `--wait-on-limit <minutes>`, the runner waits and tries the cell again in the same run. Without this rule, a limit that lasts one hour turns each remaining cell into a failure.

### Sequence

1. This record: the experiment core, with the host sandbox and the command subject.
2. The Docker sandbox, the canary probe, and the subjects for Claude Code and Codex.
3. Judges and the stop rule at the registered looks.

## Consequences

- The host sandbox isolates the home folder and the environment. It does not isolate the file system. The Docker sandbox closes that gap.
- A change to an input file after the freeze needs a new experiment. This is the purpose of the freeze.
- The experiment file has no TypeScript form yet. The process protocol gives the same power in each language.

## Verification

- `packages/experiment/src/runner.test.ts` runs a real subject and a real grader as processes. It checks the overlays, the new home folder, the environment, and the blind grader request. It also checks the retry, the timeout, the run limit, the resume, and the look.
- `packages/experiment/src/lock.test.ts` changes a file, the metric, and a limit after the freeze.
- `packages/experiment/src/schedule.test.ts` checks that each arm runs first in some pairs.
- `packages/cli/src/experiment/index.test.ts` runs `init`, `freeze`, and `run`, and it compares the verdict of the example with fixed numbers.
