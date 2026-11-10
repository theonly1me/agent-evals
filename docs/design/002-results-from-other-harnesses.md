# Results from other harnesses

## Problem

Most people who evaluate coding agents already use a harness, such as Harbor, Inspect AI, or promptfoo. Those tools print means. A person with two result sets cannot tell if the difference between them is real. The verdict of agent-evals is useful to that person only if it can read the files that those tools write.

## Decision

agent-evals reads result files. It never starts another harness, and it does not depend on one.

- **`@agent-evals/importers`** turns a location into run records. It reads a Harbor job folder, an Inspect AI log dump, a promptfoo JSON output, and a JSONL file of run records. It depends only on `records`.
- **`@agent-evals/audit`** checks the records: the balance of the arms, the failure counts, and the versions. It lists the checks that only the agent-evals runner can make as not checked. It depends only on `records`.
- **`@agent-evals/report`** joins the comparison, the power plan, the other metrics, and the audit, and renders them. It depends on `statistics`, `records`, `audit`, and `verdict`.
- **`agent-evals compare`** takes two locations, or one location with a named baseline arm.

A trial with no valid score becomes a failure with no score. An unknown shape stops the import, and the message names the file and the field.

## Consequences

- A user of another harness gets a verdict with no change to that setup.
- The audit of imported results has rows that say not checked. This is correct: nobody checked isolation or a frozen design for those runs.
- Each importer follows a format that another project owns. A fixture from the real tool pins each format, and the package guide records the tool version.
- promptfoo gives each repeat a new test index, so the importer groups repeats by `repeatGroupId`.

## Verification

- `packages/importers/src/index.test.ts` imports real output from Inspect AI 0.3.288 and promptfoo 0.125.1, and a Harbor job in the shape of the Harbor source models.
- The same file renames a field in a Harbor trial. The import stops and names the field.
- `packages/cli/src/main.test.ts` runs `compare` on each format.
