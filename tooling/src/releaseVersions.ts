import path from "node:path";
import { z } from "zod";

const productFileName = "product.json";
const configFile = ".github/release-please-config.json";
const manifestFile = ".github/release-please-manifest.json";

const configSchema = z.object({
  packages: z.record(
    z.string(),
    z.object({
      "extra-files": z.array(
        z.object({
          type: z.literal("json"),
          path: z.string(),
          jsonpath: z.literal("$.version"),
        }),
      ),
    }),
  ),
});

const versionSchema = z.object({ version: z.string() });
const releaseManifestSchema = z.record(z.string(), z.string());

export type VersionSource = {
  readonly file: string;
  readonly version: string;
};

export type ReleaseVersions = {
  readonly packageManifest: VersionSource;
  readonly bumped: readonly VersionSource[];
};

async function readJson(options: { rootDirectory: string; file: string }): Promise<unknown> {
  return Bun.file(path.join(options.rootDirectory, options.file)).json();
}

async function readSource(options: {
  rootDirectory: string;
  file: string;
}): Promise<VersionSource> {
  const { version } = versionSchema.parse(await readJson(options));

  return { file: options.file, version };
}

export async function readReleaseVersions(options: {
  rootDirectory: string;
}): Promise<ReleaseVersions> {
  const { rootDirectory } = options;
  const config = configSchema.parse(await readJson({ rootDirectory, file: configFile }));
  const released = releaseManifestSchema.parse(
    await readJson({ rootDirectory, file: manifestFile }),
  );
  const files = Object.values(config.packages).flatMap((entry) =>
    entry["extra-files"].map((extra) => extra.path),
  );
  const extraSources = await Promise.all(files.map((file) => readSource({ rootDirectory, file })));
  const releasedSources = Object.values(released).map((version) => ({
    file: manifestFile,
    version,
  }));

  return {
    packageManifest: await readSource({ rootDirectory, file: "package.json" }),
    bumped: [...extraSources, ...releasedSources],
  };
}

export function findVersionMismatches(versions: ReleaseVersions): readonly string[] {
  const { packageManifest, bumped } = versions;
  const hasProduct = bumped.some((source) => path.basename(source.file) === productFileName);
  const mismatches = bumped
    .filter((source) => source.version !== packageManifest.version)
    .map(
      (source) =>
        `${source.file} has version ${source.version}, but ${packageManifest.file} has ${packageManifest.version}`,
    );

  return hasProduct
    ? mismatches
    : [`${productFileName} is not listed in the Release Please extra-files`, ...mismatches];
}
