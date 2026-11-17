# Agent experience example

This experiment asks if better documentation helps an agent use a tool. The tool is `tally.mjs`, a small command that reads a CSV file. Each of the 8 tasks asks for one result from `orders.csv`.

- The arm `short-readme` gives the agent a README with one command and no options.
- The arm `full-readme` gives the agent a README with a table of each option.

The two README files are the only difference between the arms. You can use the same design for your product. Put the two versions of your documentation, your command help, or your error messages in the arms.

`shared/grade.mjs` is the grader. It runs the tool with the correct options and compares the result with `answer.txt`. It gives the score `correct`.

## Run it

The subject is Claude Code, so the runs use a paid model. The experiment stops at 48 runs. It has a look after 4 tasks, so it can stop early.

```bash
export CLAUDE_CODE_OAUTH_TOKEN=<your token>
agent-evals freeze examples/agent-experience
agent-evals run examples/agent-experience
```

## Limits

- No result is in this folder yet. The experiment has not run with a real agent.
- `example.test.ts` runs the experiment with a scripted subject in place of the agent. It proves that the tasks, the arms, and the grader work. It says nothing about a real agent.
