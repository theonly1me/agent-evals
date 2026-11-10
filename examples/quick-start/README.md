# Quick start example

`runs.jsonl` holds 144 synthetic run records: 24 tasks, 2 arms, and 3 repeats. A seeded simulation wrote them with a true difference of 0.2 in the pass rate. No agent ran.

```bash
bun run cli compare examples/quick-start/runs.jsonl --baseline without-skill
```

The first two lines of the output are the verdict and its evidence:

```text
with-skill is better than without-skill on passed.
Difference: +0.208 (95% interval 0.056 to 0.361, p = 0.029) over 24 tasks. without-skill: 0.403. with-skill: 0.611.
```
