import type { ReportView, Table } from "./view";

function cellOf(text: string): string {
  return text.replaceAll("|", "\\|");
}

function tableSection(table: Table): string {
  const rowOf = (cells: readonly string[]) => `| ${cells.map(cellOf).join(" | ")} |`;

  return [
    `### ${table.title}`,
    "",
    rowOf(table.headings),
    rowOf(table.headings.map(() => "---")),
    ...table.rows.map(rowOf),
  ].join("\n");
}

export function renderMarkdown(view: ReportView): string {
  const sections = [
    `## ${view.title}`,
    `**${view.headline}**`,
    view.evidence,
    ...view.notes,
    ...view.tables.map(tableSection),
  ];

  return `${sections.join("\n\n")}\n`;
}
