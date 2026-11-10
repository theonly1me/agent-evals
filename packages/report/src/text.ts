import type { ReportView, Table } from "./view";

function columnWidths(table: Table): number[] {
  return table.headings.map((heading, column) =>
    Math.max(heading.length, ...table.rows.map((row) => (row[column] ?? "").length)),
  );
}

function tableLines(table: Table): string[] {
  const widths = columnWidths(table);
  const lineOf = (cells: readonly string[]) =>
    `  ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ")}`.trimEnd();

  return [table.title, lineOf(table.headings), ...table.rows.map(lineOf)];
}

export function renderText(view: ReportView): string {
  const sections = [[view.headline, view.evidence, ...view.notes], ...view.tables.map(tableLines)];

  return `${sections.map((lines) => lines.join("\n")).join("\n\n")}\n`;
}
