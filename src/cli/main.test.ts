import { expect, test } from "bun:test";
import packageJson from "../../package.json" with { type: "json" };

test("the CLI prints the package version", async () => {
  const child = Bun.spawn(["bun", "run", "src/cli/main.ts", "--version"], {
    stdout: "pipe",
  });
  const output = await new Response(child.stdout).text();
  expect(output.trim()).toBe(packageJson.version);
  expect(await child.exited).toBe(0);
});
