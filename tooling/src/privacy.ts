import path from "node:path";
import { listFiles } from "./conventions/files";
import privacyTerms from "./privacyTerms.json";

export type PrivacyFinding = {
  readonly file: string;
  readonly line: number;
  readonly rule: "email" | "pronoun" | "private-term";
  readonly message: string;
};

export type PrivacyReport = {
  readonly checkedFileCount: number;
  readonly findings: readonly PrivacyFinding[];
};

const textExtensions = [
  ".md",
  ".mjs",
  ".js",
  ".ts",
  ".json",
  ".jsonl",
  ".html",
  ".css",
  ".txt",
  ".sh",
  ".yml",
  ".yaml",
];
const maintainerContactFiles = ["CODE_OF_CONDUCT.md"];
const allowedEmailDomains = ["example.com", "example.org", "example.net"];
const allowedAddresses = ["git@github.com"];
const emailPattern = /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const pronounPattern = /\b(?:he|him|his|himself|she|her|hers|herself)\b/i;
const longestPhraseWordCount = 3;

export function normalizeTerm(term: string): string {
  return (term.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(" ");
}

export function hashTerm(term: string): string {
  return new Bun.CryptoHasher("sha256").update(normalizeTerm(term)).digest("hex");
}

function phraseHashes(line: string): ReadonlyMap<string, string> {
  const words = normalizeTerm(line).split(" ").filter(Boolean);
  const hashes = new Map<string, string>();

  for (let start = 0; start < words.length; start += 1) {
    for (
      let length = 1;
      length <= longestPhraseWordCount && start + length <= words.length;
      length += 1
    ) {
      const phrase = words.slice(start, start + length).join(" ");

      hashes.set(hashTerm(phrase), phrase);
    }
  }

  return hashes;
}

function lineFindings(options: {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly privateHashes: ReadonlySet<string>;
}): readonly PrivacyFinding[] {
  const at = { file: options.file, line: options.line };
  const findings: PrivacyFinding[] = [];

  for (const [address, , domain = ""] of options.text.matchAll(emailPattern)) {
    const allowed =
      allowedAddresses.includes(address) || allowedEmailDomains.includes(domain.toLowerCase());

    if (!allowed) {
      findings.push({
        ...at,
        rule: "email",
        message: `${address} is a real address, use an example.com address`,
      });
    }
  }

  if (options.file.endsWith(".md") && pronounPattern.test(options.text)) {
    findings.push({
      ...at,
      rule: "pronoun",
      message: 'write "the user" or "they" instead of a gendered pronoun',
    });
  }

  for (const [hash, phrase] of phraseHashes(options.text)) {
    if (options.privateHashes.has(hash)) {
      findings.push({ ...at, rule: "private-term", message: `"${phrase}" matches a private term` });
    }
  }

  return findings;
}

function isChecked(file: string): boolean {
  const isText = textExtensions.some((extension) => file.endsWith(extension));

  return isText && !maintainerContactFiles.includes(file);
}

export async function findPrivacyFindings(options: {
  readonly rootDirectory: string;
  readonly privateTerms?: readonly string[];
}): Promise<PrivacyReport> {
  const privateHashes = new Set([
    ...privacyTerms.sha256,
    ...(options.privateTerms ?? []).map(hashTerm),
  ]);
  const files = (await listFiles({ rootDirectory: options.rootDirectory })).filter(isChecked);
  const findings: PrivacyFinding[] = [];

  for (const file of files) {
    const text = await Bun.file(path.join(options.rootDirectory, file)).text();

    for (const [index, line] of text.split("\n").entries()) {
      findings.push(...lineFindings({ file, line: index + 1, text: line, privateHashes }));
    }
  }

  return { checkedFileCount: files.length, findings };
}

if (import.meta.main) {
  const [flag, value] = Bun.argv.slice(2);

  if (flag === "--hash" && value !== undefined) {
    console.log(`"${normalizeTerm(value)}" ${hashTerm(value)}`);
  } else {
    const termsFile = flag === "--terms" && value !== undefined ? value : null;
    const privateTerms = termsFile
      ? (await Bun.file(termsFile).text()).split("\n").filter((term) => term.trim().length > 0)
      : [];
    const report = await findPrivacyFindings({ rootDirectory: process.cwd(), privateTerms });

    for (const finding of report.findings) {
      console.log(`${finding.file}:${finding.line} ${finding.rule} ${finding.message}`);
    }

    console.log(
      `privacy: checked ${report.checkedFileCount} files, found ${report.findings.length} findings`,
    );

    if (report.findings.length > 0) {
      process.exitCode = 1;
    }
  }
}
