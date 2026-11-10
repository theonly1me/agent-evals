# agent-evals

The experiment harness for coding agents. It answers one question: did this change make the agent better, and is the difference real?

You change a skill, an instruction file, a prompt, a model, or a tool. agent-evals compares the runs before and after the change. It gives one verdict: better, worse, or not conclusive. If the verdict is not conclusive, it tells you how many more tasks you need.

**Status:** in development. The `compare` command works on saved results. The runner comes next.

## Compare two sets of results

agent-evals reads the results that you already have:

- a Harbor job folder
- an Inspect AI log dump (`inspect log dump`)
- a promptfoo JSON output
- a JSONL file of [run records](packages/records/AGENTS.md)

```bash
git clone https://github.com/theonly1me/agent-evals && cd agent-evals
bun install
bun run cli compare examples/quick-start/runs.jsonl --baseline without-skill
```

```text
with-skill is better than without-skill on passed.
Difference: +0.208 (95% interval 0.056 to 0.361, p = 0.029) over 24 tasks. without-skill: 0.403. with-skill: 0.611.
```

The report also has a validity audit. It shows which checks passed, which failed, and which nobody made. The [quick start example](examples/quick-start/README.md) describes the records in this run. With two result sets, pass both locations: the first is the baseline.

## How the verdict works

- **The task is the unit.** Three repeats of one task are not three pieces of evidence. Each task gives one difference.
- **Two conditions for a verdict.** A permutation test must give a p-value below 0.05, and the 95% interval must exclude zero.
- **A power answer.** A simulation of the same rule gives the number of tasks that you need.
- **A failed run has no score.** An infrastructure failure never becomes a 0.
- **The same results give the same report.** Every method takes a seed.

[Design record 001](docs/design/001-the-verdict-is-the-product.md) gives the methods and their tests. See the [documentation](docs/README.md) for the architecture.

## License

MIT OR Apache-2.0
