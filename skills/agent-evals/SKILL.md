---
name: agent-evals
description: Use when the user asks if a change made a coding agent better, or asks to compare two sets of agent results. Also use it when the user says "did this skill help?", "is this prompt better?", or "compare these eval runs". Runs a frozen experiment or reads saved results, and gives one verdict with its evidence. Not for a single run of an agent with no comparison.
---

# Give a verdict on a change to an agent

agent-evals compares a baseline and a candidate. It gives one verdict: better, worse, or not conclusive. Run it with `npx @theonly1me/agent-evals`.

## Rules

- Never say that a change is better from a difference of means. Give the verdict line of agent-evals and its evidence line.
- If the verdict is not conclusive, say so. Give the number of tasks that the report asks for.
- Never guess the baseline arm or the metric. If the command lists the choices, ask the user.
- Do not change an experiment after the freeze. If the design must change, start a new experiment and say why.
- A run that failed has no score. Do not count it as 0.
- A run of a real agent uses a paid model. Ask the user before the first paid run, and give the number of runs.

## If the user has results

Use `compare` when results from Harbor, Inspect AI, promptfoo, or a JSONL file of run records exist.

1. With two result sets, run `npx @theonly1me/agent-evals compare <baseline results> <candidate results>`.
2. With one file that holds both arms, add `--baseline <arm>`.
3. If the command asks for a metric, add `--metric <name>`. Add `--lower-is-better` for a cost or a duration.
4. Report the first two lines, and each audit check that failed.

## If the user has no results

Write an experiment and run it.

1. Run `npx @theonly1me/agent-evals init <folder>` to get an example that needs no model. Read its `experiment.yaml`.
2. Edit the file for the question of the user:
   - **arms:** the baseline and the candidate. Put the change in the candidate with `files`, `home`, `env`, `flags`, `model`, or `promptSuffix`.
   - **tasks:** 20 tasks or more if possible. One task gives a result that does not generalize.
   - **subject:** `agent: claude-code`, `agent: codex`, or a `command`.
   - **grader:** a command that reads a JSON request on standard input and writes `{"scores": {...}}`.
   - **metric and baseline:** the main score and the arm to compare with.
3. To stop early, add `looks` with the task counts for the tests.
4. Run `npx @theonly1me/agent-evals freeze <folder>`.
5. Run `npx @theonly1me/agent-evals run <folder>`. A second run continues from the saved runs.
6. Report the verdict line, the evidence line, and each audit check that failed or that nobody made.

## A grader

A grader gets `{"task": {"id", "prompt"}, "workspace", "output"}`. It does not get the arm. It checks the files in `workspace` and writes the scores. If it cannot grade, it exits with a non-zero code, and the run gets no score.
