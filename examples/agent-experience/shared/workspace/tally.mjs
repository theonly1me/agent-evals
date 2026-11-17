#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const [file, ...flags] = process.argv.slice(2);
const option = (name) => {
  const index = flags.indexOf(name);

  return index === -1 ? undefined : flags[index + 1];
};

if (file === undefined) {
  console.error("tally: pass a CSV file");
  process.exit(2);
}

const [header, ...rows] = readFileSync(file, "utf8").trim().split("\n");
const columns = header.split(",");
const records = rows.map((row) =>
  Object.fromEntries(row.split(",").map((cell, index) => [columns[index], cell])),
);
const valueColumn = option("--of") ?? "amount";
const operation = option("--op") ?? "sum";
const groupColumn = option("--by");
const only = option("--where");
const digits = Number(option("--round") ?? "2");
const kept =
  only === undefined
    ? records
    : records.filter((record) => record[only.split("=")[0]] === only.split("=")[1]);

if (
  !columns.includes(valueColumn) ||
  (groupColumn !== undefined && !columns.includes(groupColumn))
) {
  console.error("tally: no such column");
  process.exit(2);
}

const operations = {
  sum: (values) => values.reduce((total, value) => total + value, 0),
  mean: (values) => values.reduce((total, value) => total + value, 0) / values.length,
  max: (values) => Math.max(...values),
  count: (values) => values.length,
};

if (operations[operation] === undefined) {
  console.error("tally: no such operation");
  process.exit(2);
}

const groups = new Map();

for (const record of kept) {
  const key = groupColumn === undefined ? "all" : record[groupColumn];

  groups.set(key, [...(groups.get(key) ?? []), Number(record[valueColumn])]);
}

const lines = [...groups.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, values]) => `${key}=${operations[operation](values).toFixed(digits)}`);
const text = `${lines.join("\n")}\n`;
const output = option("--out");

if (output === undefined) {
  process.stdout.write(text);
} else {
  writeFileSync(output, text);
}
