#!/usr/bin/env bun
import { compareUsage } from "./compare/arguments";
import { runCompare } from "./compare/index";
import { failed, succeeded, type CommandOutcome } from "./outcome";
import release from "./version.json" with { type: "json" };

const usage = `agent-evals ${release.version}

Commands:
  agent-evals compare    Give a verdict on two arms from saved results.
  agent-evals --version  Print the version.

${compareUsage}`;

export async function runCommand(argumentList: readonly string[]): Promise<CommandOutcome> {
  const [command, ...rest] = argumentList;

  if (command === "--version") {
    return succeeded(`${release.version}\n`);
  }

  if (command === "compare") {
    return runCompare(rest);
  }

  return command === undefined || command === "--help"
    ? succeeded(usage)
    : failed(`Unknown command "${command}".\n\n${usage}`);
}

if (import.meta.main) {
  const outcome = await runCommand(process.argv.slice(2));

  process.stdout.write(outcome.stdout);
  process.stderr.write(outcome.stderr);
  process.exitCode = outcome.exitCode;
}
