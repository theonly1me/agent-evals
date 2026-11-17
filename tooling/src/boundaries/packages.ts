export const packageNames = [
  "statistics",
  "records",
  "importers",
  "audit",
  "verdict",
  "report",
  "experiment",
  "cli",
] as const;

export type PackageName = (typeof packageNames)[number];

export type PackageLayout = {
  readonly allowedDependencies: Readonly<Record<PackageName, readonly PackageName[]>>;
};

export const packageLayout: PackageLayout = {
  allowedDependencies: {
    statistics: [],
    records: [],
    importers: ["records"],
    audit: ["records"],
    verdict: ["statistics", "records"],
    report: ["statistics", "records", "audit", "verdict"],
    experiment: ["statistics", "records", "verdict"],
    cli: ["records", "importers", "verdict", "report", "experiment"],
  },
};
