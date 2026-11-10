const skippedDirectories = [".git", "node_modules", "dist", "out", "coverage", ".turbo"] as const;

export async function listFiles(options: { rootDirectory: string }): Promise<readonly string[]> {
  const glob = new Bun.Glob("**/*");
  const files: string[] = [];

  for await (const file of glob.scan({
    cwd: options.rootDirectory,
    onlyFiles: true,
    dot: true,
  })) {
    const segments = file.split("/");
    const skipped = skippedDirectories.some((directory) => segments.includes(directory));

    if (!skipped) {
      files.push(file);
    }
  }

  return files.sort();
}
