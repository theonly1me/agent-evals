import type { ReportView, Table } from "./view";

const styles = `
:root { --page: #ffffff; --ink: #1c1d21; --muted: #5d6068; --line: #dcdee3; --better: #1a7f4b; --worse: #b3261e; --unsure: #8a6100; }
@media (prefers-color-scheme: dark) {
  :root { --page: #16171a; --ink: #eceef2; --muted: #a2a6b0; --line: #33363d; --better: #56c88b; --worse: #f2877f; --unsure: #e0b454; }
}
body { margin: 0; background: var(--page); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 32px 16px; }
h1 { font-size: 15px; font-weight: 500; color: var(--muted); margin: 0 0 8px; }
.verdict { font-size: 28px; line-height: 1.25; font-weight: 650; margin: 0 0 12px; }
.better { color: var(--better); } .worse { color: var(--worse); } .not-conclusive { color: var(--unsure); }
p { margin: 0 0 8px; } h2 { font-size: 17px; margin: 32px 0 8px; }
.scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 8px 12px 8px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 500; }
`;

const escapes: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (character) => escapes[character] ?? character);
}

function rowOf(options: { readonly cells: readonly string[]; readonly tag: "th" | "td" }): string {
  const cells = options.cells.map((cell) => `<${options.tag}>${escapeHtml(cell)}</${options.tag}>`);

  return `<tr>${cells.join("")}</tr>`;
}

function tableSection(table: Table): string {
  return [
    `<h2>${escapeHtml(table.title)}</h2>`,
    '<div class="scroll"><table>',
    `<thead>${rowOf({ cells: table.headings, tag: "th" })}</thead>`,
    `<tbody>${table.rows.map((cells) => rowOf({ cells, tag: "td" })).join("")}</tbody>`,
    "</table></div>",
  ].join("\n");
}

export function renderHtml(view: ReportView): string {
  const paragraphs = [view.evidence, ...view.notes].map((text) => `<p>${escapeHtml(text)}</p>`);

  return [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(view.title)}</title>`,
    `<style>${styles}</style></head>`,
    "<body><main>",
    `<h1>${escapeHtml(view.title)}</h1>`,
    `<p class="verdict ${view.verdict}">${escapeHtml(view.headline)}</p>`,
    ...paragraphs,
    ...view.tables.map(tableSection),
    "</main></body></html>",
    "",
  ].join("\n");
}
