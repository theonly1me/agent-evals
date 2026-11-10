# Distribution

## Problem

A person must get a first verdict with one command and no setup. The source runs on Bun, and many people who evaluate agents have Node or Python but not Bun. A release must also be safe: nobody publishes from a laptop.

## Decision

agent-evals uses the release design of shadowclone.

- **One npm package, `agent-evals`.** It holds one bundled file, `dist/agent-evals.js`, and a Node launcher, `bin/agent-evals.mjs`.
- **Bun comes with the package.** The package depends on the `bun` package from npm. The launcher starts the bundle with that Bun, or with a `bun` on the PATH. So `npx agent-evals` works on a machine that has only Node.
- **`packages/cli/src/product.json` holds the name and the version.** Release Please writes the version.
- **A release is a merge.** Release Please keeps a release pull request from the conventional commits on `main`. The merge of that pull request makes the tag. The release workflow then stages the package and publishes it with provenance, from the `npm` environment.
- **The workspace packages stay private.** The bundle holds their code, so the published package depends only on `bun`.

The first plan was a compiled binary for each platform. The bundle is 122 KB, against about 60 MB for each binary. It needs one package and not five. A TypeScript experiment file also loads in a real Bun runtime.

## Consequences

- The first install downloads Bun through npm, which takes a few seconds.
- The maintainer must set an npm trusted publisher for `agent-evals` and an `npm` environment in the repository before the first release.
- The build fails if the bundle holds a path of the build machine.

## Verification

- `packages/cli/scripts/stage.test.ts` builds and stages the package in a new folder. It runs the bundle there, checks the version, and gets a verdict for the quick start example.
- The same test checks that the only published dependency is `bun`.
- CI runs `bun run stage` and `npm pack --dry-run` on the staged package.
