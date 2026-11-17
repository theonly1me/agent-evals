import { runProcess } from "./process";
import { namedEnvironment, type RunPaths, type Sandbox, type SandboxRequest } from "./sandbox";

const containerPaths: RunPaths = {
  workspace: "/workspace",
  home: "/home/agent",
  experiment: "/experiment",
};
const clientNames = ["PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"] as const;
const stopSeconds = 30;

export type DockerUser = { readonly userId: number; readonly groupId: number };

function currentUser(): DockerUser {
  return { userId: process.getuid?.() ?? 0, groupId: process.getgid?.() ?? 0 };
}

export function dockerArguments(options: {
  readonly request: SandboxRequest;
  readonly user: DockerUser;
}): readonly string[] {
  const { request, user } = options;
  const names = Object.keys(request.environment).sort();

  return [
    "docker",
    "run",
    "--rm",
    "--interactive",
    "--name",
    request.name,
    "--user",
    `${user.userId}:${user.groupId}`,
    "--volume",
    `${request.paths.workspace}:${containerPaths.workspace}`,
    "--volume",
    `${request.paths.home}:${containerPaths.home}`,
    "--volume",
    `${request.paths.experiment}:${containerPaths.experiment}:ro`,
    "--workdir",
    containerPaths.workspace,
    "--env",
    `HOME=${containerPaths.home}`,
    ...names.flatMap((name) => ["--env", name]),
    request.image ?? "",
    ...request.command,
  ];
}

function clientEnvironment(request: SandboxRequest): Record<string, string> {
  return {
    ...request.environment,
    ...namedEnvironment({ source: process.env, names: clientNames }),
  };
}

export const dockerSandbox: Sandbox = {
  name: "docker",
  isolation: "container",
  locate: () => containerPaths,
  run: async (request) => {
    if (request.image === undefined) {
      return { status: "not-started", detail: "the docker sandbox needs an image" };
    }

    const environment = clientEnvironment(request);

    return runProcess({
      command: dockerArguments({ request, user: currentUser() }),
      input: request.input,
      workingDirectory: request.paths.workspace,
      environment,
      timeoutSeconds: request.timeoutSeconds,
      onTimeout: async () => {
        await runProcess({
          command: ["docker", "kill", request.name],
          input: "",
          workingDirectory: request.paths.workspace,
          environment,
          timeoutSeconds: stopSeconds,
        });
      },
    });
  },
};

export async function dockerProblem(): Promise<string | null> {
  const result = await runProcess({
    command: ["docker", "version", "--format", "{{.Server.Version}}"],
    input: "",
    workingDirectory: process.cwd(),
    environment: namedEnvironment({ source: process.env, names: clientNames }),
    timeoutSeconds: stopSeconds,
  });

  return result.status === "exited" && result.exitCode === 0
    ? null
    : "Docker does not answer. Start Docker, or set sandbox to host in the experiment file.";
}
