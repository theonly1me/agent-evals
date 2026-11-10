import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(1, "product.json needs a name"),
  version: z.string().min(1, "product.json needs a version"),
});

const cliManifestSchema = z.object({
  type: z.string().min(1, "the cli package.json needs a type"),
  description: z.string().min(1, "the cli package.json needs a description"),
  keywords: z.array(z.string()),
  license: z.string().min(1, "the cli package.json needs a license"),
  repository: z.object({ type: z.string(), url: z.string() }),
  homepage: z.string().min(1, "the cli package.json needs a homepage"),
  bugs: z.object({ url: z.string() }),
  bin: z.record(z.string(), z.string()),
  files: z.array(z.string()).min(1, "the cli package.json needs a files list"),
  dependencies: z.record(z.string(), z.string()),
});

const workspaceRangePrefix = "workspace:";

export type PublishedManifest = z.infer<typeof productSchema> &
  Omit<z.infer<typeof cliManifestSchema>, "dependencies"> & {
    readonly dependencies: Readonly<Record<string, string>>;
  };

function describeIssues(options: { readonly label: string; readonly error: z.ZodError }): string {
  const lines = options.error.issues.map(
    (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );

  return `${options.label} is not valid:\n${lines.join("\n")}`;
}

export function publishedManifest(options: {
  readonly cliManifest: unknown;
  readonly product: unknown;
}): PublishedManifest {
  const product = productSchema.safeParse(options.product);

  if (!product.success) {
    throw new Error(describeIssues({ label: "product.json", error: product.error }));
  }

  const manifest = cliManifestSchema.safeParse(options.cliManifest);

  if (!manifest.success) {
    throw new Error(describeIssues({ label: "The cli package.json", error: manifest.error }));
  }

  return {
    ...product.data,
    ...manifest.data,
    dependencies: Object.fromEntries(
      Object.entries(manifest.data.dependencies).filter(
        ([, range]) => !range.startsWith(workspaceRangePrefix),
      ),
    ),
  };
}
