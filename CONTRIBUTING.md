# Contributing

## Development setup

Install [Bun](https://bun.sh) 1.4.2, as `package.json` declares. Run `bun install` and `bun run check`.

Use `bun run cli` to run agent-evals from the checkout. Tests use synthetic data and public fixtures, and they need no account.

## Repository layout

The repository is a Bun workspace. Each package in `packages/` is `@agent-evals/<name>` and has its own `AGENTS.md`. `examples/` and `tooling/` are private workspaces. The [architecture](docs/architecture/README.md) shows the package graph, and `bun run lint` checks every import against it.

## Making a change

Describe the problem and the approach in `docs/` before you implement. For a new product or architecture decision, use the [design template](docs/design/template.md) and add the record to the [index](docs/design/README.md).

Keep changes focused and add tests for behavior that can regress. Before you submit, run `bun run check`: typecheck, lint, the knip unused-file check, and tests. CI runs the same checks on Linux and macOS. The [Vigilante check](.github/workflows/vigilante.yml) fails when a change adds a power that `vigilante.lock` does not list. Examples are a new process call, a network call, and a workflow secret.

## Add a package

1. Create `packages/<name>/package.json`. Set `name` to `@agent-evals/<name>`, `private` to `true`, and `type` to `module`. Set no version.
2. Add `exports` with `"."` for `./src/index.ts`.
3. Add the scripts `typecheck` (`tsc --noEmit`) and `test` (`bun test`). Add a `tsconfig.json` that extends `../../tsconfig.base.json` and includes `["src"]`.
4. In `tooling/src/boundaries/packages.ts`, add the name to `packageNames` and a row to `allowedDependencies`. Record each new dependency edge in a design record.
5. Add an `AGENTS.md` in the shape of another package guide, a `CLAUDE.md` that contains only `@AGENTS.md`, and a row in the table in `docs/architecture/README.md`.
6. Run `bun install`, `bun run guides`, and `bun run check`.

## Code conventions

- Use complete names, and an options object for functions with two or more arguments.
- Keep TypeScript files at 200 lines or fewer, including tests.
- Avoid `any`, non-null assertions, type assertions other than `as const`, and unhandled or voided promises.
- Write code without comments. Express intent in names, types, functions, and tests.
- Fix lint findings. Do not suppress rules.
- Format changed files with `bun run format <files>`. Check them with `bun run format:check <files>`.
- Do not use em dashes or en dashes.

## Statistical methods

A method that can change a verdict needs three things:

1. A test against a known value or a saved analysis.
2. A simulation that measures its error rate.
3. A section in a design record that states each assumption.

## Pull requests

Use the [PR template](.github/pull_request_template.md). Keep the body under 250 words. [AGENTS.md](AGENTS.md#handoff-and-git) sets the format of commit messages and titles.

## Releasing

Release Please maintains a release PR from conventional commits on `main`. Merging it creates the version tag and the GitHub release. After CI passes, a maintainer approves the `npm` environment, and the workflow publishes `agent-evals` with provenance.

The first release is 0.1.0, because `release-as` in `.github/release-please-config.json` sets it. Remove that line after the first release.

Use `feat:` for a minor version, `fix:` for a patch, and `!` for a breaking change. `bun run stage` writes the package to `packages/cli/out/package`. Inspect it with `npm pack --dry-run` before a release. [Design record 003](docs/design/003-distribution.md) gives the reasons.
