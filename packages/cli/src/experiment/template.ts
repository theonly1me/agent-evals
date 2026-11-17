const words = [
  "amber",
  "birch",
  "cedar",
  "delta",
  "ember",
  "fjord",
  "grove",
  "heron",
  "inlet",
  "jetty",
  "kelp",
  "lagoon",
  "marsh",
  "nettle",
  "orchid",
  "pebble",
] as const;

const experimentYaml = `name: example
metric: passed
baseline: without-hint

arms:
  without-hint: {}
  with-hint:
    files:
      HINT.md: arms/with-hint/HINT.md

tasks:
${words.map((word) => `  - id: ${word}\n    prompt: Write the word ${word} in upper case to answer.txt.`).join("\n")}

subject:
  command: [node, ./subject.mjs]
grader:
  command: [node, ./grader.mjs]

repeats: 2
seed: 1
`;

const subjectScript = `import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const request = JSON.parse(readFileSync(0, "utf8"));
const word = request.task.id;
const hasHint = existsSync("HINT.md");
const skill = hasHint ? 0.85 : 0.45;

let hash = 2166136261;
for (const character of path.basename(path.dirname(request.workspace))) {
  hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
}
const solved = hash / 4294967296 < skill;

writeFileSync("answer.txt", solved ? word.toUpperCase() : word);
process.stdout.write(JSON.stringify({ output: solved ? "done" : "done, I think" }));
`;

const graderScript = `import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const request = JSON.parse(readFileSync(0, "utf8"));
const answerFile = path.join(request.workspace, "answer.txt");
const answer = existsSync(answerFile) ? readFileSync(answerFile, "utf8").trim() : "";

process.stdout.write(
  JSON.stringify({ scores: { passed: answer === request.task.id.toUpperCase() ? 1 : 0 } }),
);
`;

const readme = `# Example experiment

This experiment compares two arms on 16 tasks, with 2 repeats. It needs no model and no login.

- \`subject.mjs\` is a simulated agent. It solves a task more often when the workspace has \`HINT.md\`.
- \`grader.mjs\` gives the score \`passed\`. It never sees the name of the arm.
- The arm \`with-hint\` adds \`HINT.md\` to the workspace. The arm \`without-hint\` adds nothing.

\`\`\`bash
agent-evals freeze .
agent-evals run .
\`\`\`

To test a real change, replace the subject with a command that starts your agent, and put your files in the arms.
`;

export const templateFiles: Readonly<Record<string, string>> = {
  "experiment.yaml": experimentYaml,
  "subject.mjs": subjectScript,
  "grader.mjs": graderScript,
  "arms/with-hint/HINT.md": "Write the answer in upper case letters.\n",
  "README.md": readme,
};
