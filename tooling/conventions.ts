const maximumLineCount = 200;
const skippedSegments = ["node_modules", ".git", "dist", "out", "fixtures"];
const proseSuffixes = [".ts", ".md", ".yml", ".yaml", ".json", ".html"];
const commentPattern = /^\s*(\/\/|\/\*|\*\s)/;
const dashPattern = /[–—]/;
const privatePathPattern = /\/(Users|home)\/[a-z][a-z0-9_-]+\//;

type Violation = { file: string; line: number; rule: string };

function lineViolations(options: { file: string; text: string }): Violation[] {
  const isCode = options.file.endsWith(".ts");
  return options.text.split("\n").flatMap((lineText, lineIndex) => {
    const rules = [
      isCode && commentPattern.test(lineText) ? "no-comments" : undefined,
      dashPattern.test(lineText) ? "no-dashes" : undefined,
      privatePathPattern.test(lineText) ? "no-private-paths" : undefined,
    ];
    return rules.flatMap((rule) =>
      rule ? [{ file: options.file, line: lineIndex + 1, rule }] : [],
    );
  });
}

function fileViolations(options: { file: string; text: string }): Violation[] {
  const lineCount = options.text.trimEnd().split("\n").length;
  const sizeViolations =
    options.file.endsWith(".ts") && lineCount > maximumLineCount
      ? [{ file: options.file, line: lineCount, rule: "max-200-lines" }]
      : [];
  return [...sizeViolations, ...lineViolations(options)];
}

async function listFiles(): Promise<string[]> {
  const files: string[] = [];
  for await (const file of new Bun.Glob("**/*").scan({ dot: true })) {
    const isSkipped = file
      .split("/")
      .some((segment) => skippedSegments.includes(segment));
    const isProse = proseSuffixes.some((suffix) => file.endsWith(suffix));
    if (!isSkipped && isProse && file !== "tooling/conventions.ts") {
      files.push(file);
    }
  }
  return files.sort();
}

const files = await listFiles();
const violations: Violation[] = [];
for (const file of files) {
  const text = await Bun.file(file).text();
  violations.push(...fileViolations({ file, text }));
}
for (const violation of violations) {
  console.error(`${violation.file}:${violation.line} ${violation.rule}`);
}
console.log(
  `conventions: ${violations.length} violations in ${files.length} files`,
);
process.exit(violations.length === 0 ? 0 : 1);
