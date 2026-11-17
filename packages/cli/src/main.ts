#!/usr/bin/env bun
import { compareUsage } from "./compare/arguments";
import { runCompare } from "./compare/index";
import { experimentUsage, type Progress, runFreeze, runInit, runRun } from "./experiment/index";
import { failed, succeeded, type CommandOutcome } from "./outcome";
import product from "./product.json" with { type: "json" };

const usage = `agent-evals ${product.version}

Commands:
  agent-evals init       Write an example experiment.
  agent-evals freeze     Freeze the design of an experiment.
  agent-evals run        Run a frozen experiment and give the verdict.
  agent-evals compare    Give a verdict on two arms from saved results.
  agent-evals --version  Print the version.

${experimentUsage}
${compareUsage}`;

const silent: Progress = () => undefined;

export async function runCommand(
  argumentList: readonly string[],
  onProgress: Progress = silent,
): Promise<CommandOutcome> {
  const [command, ...rest] = argumentList;

  if (command === "--version") {
    return succeeded(`${product.version}\n`);
  }

  if (command === "compare") {
    return runCompare(rest);
  }

  if (command === "init") {
    return runInit(rest);
  }

  if (command === "freeze") {
    return runFreeze(rest);
  }

  if (command === "run") {
    return runRun({ argumentList: rest, onProgress });
  }

  return command === undefined || command === "--help"
    ? succeeded(usage)
    : failed(`Unknown command "${command}".\n\n${usage}`);
}

if (import.meta.main) {
  const outcome = await runCommand(process.argv.slice(2), (line) => {
    process.stderr.write(`${line}\n`);
  });

  process.stdout.write(outcome.stdout);
  process.stderr.write(outcome.stderr);
  process.exitCode = outcome.exitCode;
}
