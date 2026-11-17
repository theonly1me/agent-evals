import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { probeIsolation } from "./canary";
import { dockerArguments, dockerSandbox } from "./docker";
import { freezeExperiment } from "./lock";
import { runProcess } from "./process";
import { runExperiment } from "./runner";
import { hostSandbox, type Sandbox } from "./sandbox";
import { type Experiment, loadExperiment } from "./spec";
import { storeOf } from "./store";
import { type SampleOptions, writeSampleExperiment } from "./testing/sample";

const dockerImage = "alpine:3.20";
const dockerAnswers =
  Bun.which("docker") !== null &&
  Bun.spawnSync(["docker", "version"], { stdout: "ignore", stderr: "ignore" }).success;

const shellSubject = `#!/bin/sh
cat > /dev/null
if [ -f HINT.md ]; then printf right > answer.txt; else printf wrong > answer.txt; fi
printf '{"output":"home=%s"}' "$HOME"
`;

async function sample(options: SampleOptions = {}): Promise<Experiment> {
  const directory = await writeSampleExperiment(options);

  await Bun.write(path.join(directory, "subject.sh"), shellSubject);
  const result = await loadExperiment(directory);

  if (result.status === "rejected") {
    throw new Error(result.problem);
  }

  return result.experiment;
}

test("the docker command names each variable and never holds its value", () => {
  const command = dockerArguments({
    user: { userId: 501, groupId: 20 },
    request: {
      name: "agent-evals-abc",
      command: ["claude", "--print", "Solve it."],
      input: "",
      paths: { workspace: "/work/w", home: "/work/h", experiment: "/experiments/e" },
      environment: { API_TOKEN: "secret-value", MODE: "fast" },
      timeoutSeconds: 10,
      image: "agents:1",
    },
  });

  expect(command).toEqual([
    "docker",
    "run",
    "--rm",
    "--interactive",
    "--name",
    "agent-evals-abc",
    "--user",
    "501:20",
    "--volume",
    "/work/w:/workspace",
    "--volume",
    "/work/h:/home/agent",
    "--volume",
    "/experiments/e:/experiment:ro",
    "--workdir",
    "/workspace",
    "--env",
    "HOME=/home/agent",
    "--env",
    "API_TOKEN",
    "--env",
    "MODE",
    "agents:1",
    "claude",
    "--print",
    "Solve it.",
  ]);
  expect(command.join(" ")).not.toContain("secret-value");
});

test("the host probe finds a new home and a clean environment", async () => {
  const experiment = await sample();
  const realHome = await mkdtemp(path.join(os.tmpdir(), "agent-evals-real-home-"));
  const probe = await probeIsolation({
    sandbox: hostSandbox,
    experiment,
    store: storeOf(experiment),
    realHome,
  });

  expect(probe.status).toBe("isolated");
  expect(probe.status === "isolated" ? probe.level : "").toBe("home");
});

test("the probe reports a sandbox that passes the environment or shares the home folder", async () => {
  const experiment = await sample();
  const realHome = await mkdtemp(path.join(os.tmpdir(), "agent-evals-real-home-"));
  const environmentOf = () =>
    Object.fromEntries(
      Object.entries(process.env).flatMap(([name, value]) =>
        value === undefined ? [] : [[name, value]],
      ),
    );
  const leaky: Sandbox = {
    ...hostSandbox,
    run: (request) =>
      runProcess({
        command: request.command,
        input: request.input,
        workingDirectory: request.paths.workspace,
        timeoutSeconds: request.timeoutSeconds,
        environment: { ...environmentOf(), HOME: request.paths.home },
      }),
  };
  const sharesHome: Sandbox = {
    ...hostSandbox,
    run: (request) => hostSandbox.run({ ...request, paths: { ...request.paths, home: realHome } }),
  };
  const store = storeOf(experiment);

  expect(await probeIsolation({ sandbox: leaky, experiment, store, realHome })).toEqual({
    status: "leaked",
    problem: "The sandbox passed an environment variable of the runner to the subject.",
  });
  expect(process.env.AGENT_EVALS_CANARY).toBeUndefined();
  expect(await probeIsolation({ sandbox: sharesHome, experiment, store, realHome })).toEqual({
    status: "leaked",
    problem: "The home folder of the subject is the home folder of the user.",
  });
});

test("the probe says that it did not run when the sandbox cannot start a program", async () => {
  const experiment = await sample();
  const broken: Sandbox = {
    ...hostSandbox,
    run: async () => ({ status: "not-started", detail: "no such program" }),
  };

  expect(await probeIsolation({ sandbox: broken, experiment, store: storeOf(experiment) })).toEqual(
    { status: "not-run", problem: "The isolation probe did not run: no such program." },
  );
});

test.skipIf(!dockerAnswers)(
  "a docker run keeps the user home out of the container and gives the same scores",
  async () => {
    const experiment = await sample({
      tasks: ["a", "b"],
      spec: {
        repeats: 1,
        sandbox: "docker",
        image: dockerImage,
        subject: { command: ["sh", "./subject.sh"] },
      },
    });
    const lock = await freezeExperiment(experiment);
    const store = storeOf(experiment);
    const probe = await probeIsolation({ sandbox: dockerSandbox, experiment, store });
    const summary = await runExperiment({ experiment, lock, sandbox: dockerSandbox });
    const scoreOf = (arm: string) =>
      summary.records.filter((record) => record.arm === arm).map((record) => record.scores.passed);

    expect(probe).toMatchObject({ status: "isolated", level: "container" });
    expect(summary.records.map((record) => record.status)).toEqual(Array(4).fill("completed"));
    expect(scoreOf("hinted")).toEqual([1, 1]);
    expect(scoreOf("plain")).toEqual([0, 0]);
    expect(summary.records.every((record) => record.isolation === "container")).toBe(true);
  },
  180_000,
);
