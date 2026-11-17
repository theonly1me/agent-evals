# Repository checks

## Problem

agent-evals follows the code conventions of shadowclone, but it had only a part of the checks that enforce them. Two gaps mattered:

- Nothing stopped a real email address or a private name in a public file. An example with results from a real run is the most probable place for one.
- Nothing checked that the versions that Release Please writes agree. A release with two different versions publishes a package that reports the wrong version.

The limit of 200 lines for each TypeScript file was also too low. It forced a split of a module that reads better as one file.

## Decision

`bun run lint` and `bun run test` run the same set of checks as shadowclone, with these differences.

- **The line limit is 500.** `tooling/src/conventions.ts` holds the number.
- **The privacy check reads the full checkout.** The check in shadowclone reads only the skills that it ships. All of agent-evals is public. Thus `tooling/src/privacy.ts` reads each text file, with the fixtures and the example results included.
- **The privacy check has three rules.** It reports a real email address, a private term, and a gendered pronoun in Markdown. `tooling/src/privacyTerms.json` holds each private term as a SHA-256 hash, so the list names nothing.
- **`CODE_OF_CONDUCT.md` is exempt**, because it must give the contact address of the maintainer.
- **The release version check is a test.** `tooling/src/releaseVersions.test.ts` reads the Release Please configuration and its manifest, and it compares each version with the root `package.json`.

The conventions check already reports a machine path, so the privacy check does not repeat that rule. The URL allowlist of shadowclone protects installed skills from an unknown link. It does not apply to documentation, so agent-evals does not have it.

CI keeps one job that runs each check on Linux and on macOS. It now saves the Turbo cache between runs, and it ignores the cache on `main`. Vigilante runs on each pull request and compares the powers of the change with `vigilante.lock`.

## Consequences

- A contributor who adds a real address to an example gets a lint error with the file and the line.
- To add a private term, run `bun run tooling/src/privacy.ts --hash "<term>"` and add the hash to `tooling/src/privacyTerms.json`.
- A file can grow to 500 lines. Review must still ask for a split when a file holds two concerns.

## Verification

- `tooling/src/privacy.test.ts` checks each rule on a synthetic tree, and it checks that the repository has no finding.
- `tooling/src/releaseVersions.test.ts` checks a product version and a manifest version that differ from `package.json`.
- `tooling/src/conventions.test.ts` checks that a file of 501 lines fails.
