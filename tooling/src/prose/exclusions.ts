export const proseExclusions = {
  excluded: [
    ".git/**",
    "**/node_modules/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/dist/**",
    "**/out/**",
    "**/fixtures/**",
    "examples/*/shared/**",
    "CHANGELOG.md",
    "LICENSE-*",
  ],
  kept: [],
} as const;
