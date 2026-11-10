#!/usr/bin/env bun
import packageJson from "../../package.json" with { type: "json" };

const usage = `agent-evals ${packageJson.version}

Usage:
  agent-evals --version
`;

function main(argumentList: readonly string[]): number {
  if (argumentList.includes("--version")) {
    console.log(packageJson.version);
    return 0;
  }
  console.log(usage);
  return argumentList.length === 0 ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
