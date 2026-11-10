# Working on agent-evals

agent-evals is the experiment harness for coding agents. It tells the user if a change made an agent better, and if the difference is real.

Follow `CONTRIBUTING.md` when you edit code or prose. Read a package `AGENTS.md` before you change that package.

## Layout

- `packages/*`: the `@agent-evals/<name>` packages, with dependencies in the [architecture](docs/architecture/README.md).
- `examples/`, `tooling/`: private workspaces for example experiments and repository checks.
- `docs/design/`: one record for each product or architecture decision.

## Package rules

- Import another package only by its name and its declared subpaths.
- `tooling/src/boundaries/packages.ts` holds the package graph, and the boundary check enforces it. Add a dependency edge only with a design record.
- If a change alters the purpose, exports, dependencies, or rules of a package, update its guide in the same commit and run `bun run guides`.

## Work on the requested change

Inspect the worktree and keep unrelated edits. Before you implement, record the reasoning and sequence in `docs/`. If you extend a design, use its existing record. Keep types and names explicit. Use Bun and the existing module boundaries. Add a dependency only for a concrete reason.

## Results must hold

- A statistical method needs a test against an independent source: a known value, a saved analysis, or a simulation.
- A failed run has no score. Never turn an infrastructure failure or a judge timeout into a score of 0.
- Each method takes its seed as input, so the same records always give the same report.
- A skip, a fallback, or a default that changes a verdict must appear in the report.

## Checks

```bash
bun install
bun run check
bun run cli --version
```

`bun run check` runs typecheck, lint, knip, and tests. Run focused checks while you edit and the full gate before handoff. Before you open a pull request, run `npx @theonly1me/vigilante@0.3.0 diff --base origin/main`. If it lists an intended new power, run `npx @theonly1me/vigilante@0.3.0 lock` and commit `vigilante.lock`. Tests use synthetic data and public fixtures. An authenticated run or paid evaluation needs an explicitly authorized scope.

## Data boundaries

- Keep private repository material, transcripts, and machine paths outside this public checkout, including ignored files.
- An example commits only its spec, its graders, its aggregate results, and its report.
- Public evaluation material may name models and versions. It must not name evaluators, billing details, or private repositories.

## Documentation

- Write all Markdown and all text that a person reads in ASD-STE100 Simplified Technical English at about 80% strictness. `CHANGELOG.md` is exempt.
- Update each page that your change affects, and start at the [documentation index](docs/README.md).
- Keep the README a short path to a first verdict. Put detail in `docs/`.

## Handoff and Git

Explain what changed, how you verified it, and the remaining limits. Commit, push, and open a draft pull request. Before you push to a branch that has a pull request, run `gh pr view --json state`.

Commit messages and pull request titles use one lowercase conventional-commit subject, such as `fix: count a judge timeout as a failure`, with no body and no co-author trailer. The repository permits only squash merges, and a squash merge uses the title as the subject on `main`.
