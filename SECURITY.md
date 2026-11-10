# Security

Report a security problem in private, with **Report a vulnerability** on the **Security** tab. Never put sensitive evidence in a public issue.

## What to report

- A result file that makes agent-evals run code, read a file outside the given location, or write outside the output file.
- An HTML report that runs script from a name or a value in the results.
- A published package that holds a secret, a machine path, or a file that the release did not intend.
- A release that does not match the source at its tag.

Include a synthetic reproduction and the affected version. There is no bounty and no guaranteed response time.

## Supported releases

Before version 1.0, security fixes target the newest release. Published npm packages include provenance. Check it against the [release workflow](.github/workflows/release.yml).
