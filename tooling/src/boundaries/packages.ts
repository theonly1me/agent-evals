export const packageNames = [
  "statistics",
  "records",
  "importers",
  "audit",
  "verdict",
  "report",
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
    cli: ["records", "importers", "verdict", "report"],
  },
};
