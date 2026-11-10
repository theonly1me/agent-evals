import type { Report } from "./build";
import { renderHtml } from "./html";
import { renderMarkdown } from "./markdown";
import { renderText } from "./text";
import { viewOf } from "./view";

export {
  buildReport,
  metricsOf,
  type Report,
  type ReportQuestion,
  type SecondaryComparison,
} from "./build";

export const reportFormats = ["text", "markdown", "html", "json"] as const;
export type ReportFormat = (typeof reportFormats)[number];

function jsonValue(_key: string, value: unknown): unknown {
  return typeof value === "number" && !Number.isFinite(value) ? null : value;
}

export function renderReport(options: {
  readonly report: Report;
  readonly format: ReportFormat;
}): string {
  const { report, format } = options;

  if (format === "json") {
    return `${JSON.stringify(report, jsonValue, 2)}\n`;
  }

  const view = viewOf(report);

  if (format === "markdown") {
    return renderMarkdown(view);
  }

  return format === "html" ? renderHtml(view) : renderText(view);
}
