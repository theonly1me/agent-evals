export const proseExclusions = {
  excluded: [
    ".git/**",
    "**/node_modules/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/dist/**",
    "**/out/**",
    "**/fixtures/**",
    "CHANGELOG.md",
    "LICENSE-*",
  ],
  kept: [],
} as const;
