# Sandboxes and agent subjects

## Problem

A coding agent reads the settings of the person who runs it: global instruction files, skills, and login files in the home folder. If a run reads them, the experiment measures those settings and not the arm. The experiment core gives each run a new home folder on the host. But a program on the host can still read each file by its absolute path.

An experiment on a real agent also needs a subject that starts Claude Code or Codex. Each user would otherwise write that program again.

## Decision

### Two sandboxes behind one interface

The experiment file has a `sandbox` field: `host` (the default) or `docker`. A sandbox starts one program with a workspace, a home folder, and a set of environment variables.

- **`host`** starts the program on the machine, with `HOME` set to the new home folder. The environment holds only `PATH`, `LANG`, and `TMPDIR`, with the variables that the experiment names.
- **`docker`** starts the program in a new container of the `image` in the experiment file. It mounts the workspace, the new home folder, and the experiment folder (read only). It mounts nothing else, so the container cannot read the home folder of the user.

The Docker command names each environment variable with `--env NAME`, and the value comes from the environment of the Docker client. Thus a token never appears in a process list. On a timeout, the runner stops the container with `docker kill`.

`docker/Dockerfile` builds an image with Claude Code and Codex. Give both versions as build arguments, so that each run uses the same versions.

### The canary probe

Before the first run, `agent-evals run` plants a random token in two places. One is an environment variable of the runner. The other is a file in the home folder of the user. It then starts a probe program in the sandbox. The probe reads the variable, its own home folder, and the file by its absolute path.

- If the probe reads the token from the environment or from its own home folder, the run stops.
- In the `docker` sandbox, the run also stops if the probe reads the file by its absolute path.
- On the host, a read by the absolute path is possible, and the audit says so.

The runner removes the file after the probe. During the runs, the token stays in the environment of the runner. If the output of a subject holds the token, that run is an infrastructure failure.

Each run record carries its isolation level, `home` or `container`. The audit check `isolation` reports the level, and it fails if a run has no level.

### Agent subjects

`subject: { agent: claude-code }` and `subject: { agent: codex }` start the agent with the prompt of the task. The arm gives the model and the extra flags.

- Claude Code runs with `--print --output-format json`. The runner reads the result text and the cost. A result with `is_error` is an infrastructure failure, not a score of 0.
- Codex runs with `exec --json`. The output is the text of its agent messages.
- The runner reads the version of the agent one time for each image, and each record carries it.

An agent needs a login in its new home folder. The experiment names it in one of two ways:

- `passEnv` passes a variable, for example an API key.
- `auth.files` copies a file from the home folder of the user into the new home folder of each run, for example `~/.codex/auth.json`.

The lock holds the names in `passEnv` and the paths in `auth.files`. It does not hold their contents.

## Consequences

- The Docker sandbox needs an image that the user builds. agent-evals does not publish an image.
- The agent subjects run with the permission checks of the agent off, because no person can answer a prompt. Use the Docker sandbox for a task that can damage files.
- agent-evals starts the agents itself. It does not use the launcher of another project.

## Verification

- `packages/experiment/src/sandbox.test.ts` checks the Docker command and the probe on the host. It also checks the probe on a sandbox that passes the environment, and on one that shares the home folder. If Docker answers, it also runs an experiment in a real container. Without Docker, the test output lists that test as skipped.
- `packages/experiment/src/subjects.test.ts` puts fake `claude` and `codex` programs on the `PATH`. It checks the arguments, the cost, the version, the error result, and the copy of the login file.
