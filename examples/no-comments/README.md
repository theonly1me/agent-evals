# No comments example

This experiment asks one question: if you tell a coding agent to write no comments, is the code easier to read?

It is the port of a study that ran on another harness. The first study had 160 runs. Its analysis is the parity fixture of `@agent-evals/statistics`.

## Design

- **One task.** Add usage billing and plan changes to `ledger`, a small Python library in `shared/seed_repo`. The prompt is `shared/prompt.md`.
- **Two arms.** `comments-allowed` gets the prompt. `comments-banned` gets the prompt and one more sentence that bans comments and docstrings.
- **Four settings.** Each folder is one experiment with one agent and one model: `claude-sonnet`, `claude-opus`, `codex-luna`, and `codex-sol`.
- **20 repeats** for each arm in each setting: 160 runs in total.

## Scores

`shared/grade.py` is the grader. It copies the hidden tests into the workspace, runs them, and removes them. It gives these scores:

- `hidden_tests_passed` and `all_hidden_tests_pass`: the correctness of the change.
- `seed_tests_passed`: the tests that came with the library still pass.
- `new_comments`: the comments and docstrings that the run added.

The grader also writes a copy of each changed source file with the comments removed. Two pairwise judges read only those copies, so a judge cannot tell the arm from a comment. Each judge sees each pair in both orders. The main metric is `readability-claude-judge`.

## Run it

The grader needs Python 3 with `pytest`. The agents need a login:

- Claude Code reads `CLAUDE_CODE_OAUTH_TOKEN`. Make one with `claude setup-token`.
- Codex reads `~/.codex/auth.json`. The runner copies it into the new home folder of each run.

```bash
export CLAUDE_CODE_OAUTH_TOKEN=<your token>
agent-evals freeze examples/no-comments/claude-sonnet
agent-evals run examples/no-comments/claude-sonnet
```

Each setting stops at 40 runs and 80 judge calls. These runs use paid models.

## Limits

- The experiment has one task. Thus the unit of analysis is the run, and the result does not generalize to other tasks.
- Each setting is a separate experiment with its own verdict. This example does not pool the settings.
- No result is in this folder yet. The four settings have not run on agent-evals.
