import { stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const overlaySchema = z.record(z.string().min(1), z.string().min(1));

const armSchema = z.strictObject({
  files: overlaySchema.default({}),
  home: overlaySchema.default({}),
  env: z.record(z.string().min(1), z.string()).default({}),
  flags: z.array(z.string()).default([]),
  model: z.string().min(1).optional(),
  image: z.string().min(1).optional(),
});

const namePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const nameSchema = z
  .string()
  .regex(namePattern, "a name has letters, digits, dots, underscores, and dashes");

const taskSchema = z.strictObject({
  id: nameSchema,
  prompt: z.string().min(1).optional(),
  promptFile: z.string().min(1).optional(),
  workspace: z.string().min(1).optional(),
});

const programSchema = z.strictObject({
  command: z.array(z.string().min(1)).min(1, "a command needs a program"),
});

const experimentSchema = z.strictObject({
  name: z.string().min(1),
  metric: z.string().min(1),
  lowerIsBetter: z.boolean().default(false),
  baseline: z.string().min(1),
  arms: z.record(nameSchema, armSchema),
  tasks: z.array(taskSchema).min(1, "an experiment needs a task"),
  subject: programSchema,
  grader: programSchema,
  repeats: z.number().int().positive().default(1),
  seed: z.number().int().nonnegative().default(20261007),
  looks: z.array(z.number().int().positive()).default([]),
  maxRuns: z.number().int().positive().optional(),
  maxCostUsd: z.number().positive().optional(),
  retries: z.number().int().nonnegative().default(1),
  timeoutSeconds: z.number().positive().default(600),
  passEnv: z.array(z.string().min(1)).default([]),
});

export type Arm = z.infer<typeof armSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Program = z.infer<typeof programSchema>;
export type ExperimentSpec = z.infer<typeof experimentSchema>;
export type Experiment = ExperimentSpec & {
  readonly directory: string;
  readonly specFile: string;
};

export type LoadedExperiment =
  | { readonly status: "loaded"; readonly experiment: Experiment }
  | { readonly status: "rejected"; readonly problem: string };

export const specFileNames = ["experiment.yaml", "experiment.yml", "experiment.json"] as const;

function rejected(problem: string): LoadedExperiment {
  return { status: "rejected", problem };
}

async function kindOf(location: string): Promise<"file" | "directory" | "missing"> {
  try {
    return (await stat(location)).isDirectory() ? "directory" : "file";
  } catch {
    return "missing";
  }
}

async function findSpecFile(location: string): Promise<string | null> {
  const kind = await kindOf(location);

  if (kind === "file") {
    return location;
  }

  if (kind === "missing") {
    return null;
  }

  for (const name of specFileNames) {
    const candidate = path.join(location, name);

    if ((await kindOf(candidate)) === "file") {
      return candidate;
    }
  }

  return null;
}

function parseText(options: { readonly file: string; readonly text: string }): unknown {
  return options.file.endsWith(".json") ? JSON.parse(options.text) : Bun.YAML.parse(options.text);
}

function designProblems(spec: ExperimentSpec): readonly string[] {
  const armNames = Object.keys(spec.arms);
  const taskIds = spec.tasks.map((task) => task.id);
  const repeatedIds = taskIds.filter((id, index) => taskIds.indexOf(id) !== index);
  const promptless = spec.tasks.filter(
    (task) => (task.prompt === undefined) === (task.promptFile === undefined),
  );
  const looksAscend = spec.looks.every((look, index) => look > (spec.looks[index - 1] ?? 0));
  const lastLook = spec.looks.at(-1) ?? 0;

  return [
    armNames.length < 2 ? "arms: an experiment needs two arms or more" : null,
    armNames.includes(spec.baseline)
      ? null
      : `baseline: "${spec.baseline}" is not an arm. The arms are: ${armNames.join(", ")}`,
    repeatedIds.length > 0 ? `tasks: the id "${repeatedIds[0]}" appears more than once` : null,
    promptless.length > 0
      ? `tasks: "${promptless[0]?.id}" needs one of prompt and promptFile`
      : null,
    looksAscend ? null : "looks: write the task counts in ascending order",
    lastLook > spec.tasks.length
      ? `looks: the look at ${lastLook} tasks is after the last of ${spec.tasks.length} tasks`
      : null,
  ].filter((problem) => problem !== null);
}

export async function loadExperiment(location: string): Promise<LoadedExperiment> {
  const specFile = await findSpecFile(location);

  if (specFile === null) {
    return rejected(
      `${location} has no experiment file. The names are: ${specFileNames.join(", ")}.`,
    );
  }

  const text = await Bun.file(specFile).text();
  let raw: unknown;

  try {
    raw = parseText({ file: specFile, text });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    return rejected(`${specFile} is not valid: ${detail}`);
  }

  const parsed = experimentSchema.safeParse(raw);

  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );

    return rejected(`${specFile} is not valid:\n${lines.join("\n")}`);
  }

  const problems = designProblems(parsed.data);

  if (problems.length > 0) {
    return rejected(`${specFile} is not valid:\n${problems.join("\n")}`);
  }

  return {
    status: "loaded",
    experiment: { ...parsed.data, directory: path.dirname(path.resolve(specFile)), specFile },
  };
}

export async function promptOf(options: {
  readonly experiment: Experiment;
  readonly task: Task;
}): Promise<string> {
  const { experiment, task } = options;

  if (task.prompt !== undefined) {
    return task.prompt;
  }

  return Bun.file(path.join(experiment.directory, task.promptFile ?? "")).text();
}
