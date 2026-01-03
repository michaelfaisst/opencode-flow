import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import chalk from "chalk";

import { getGitRoot } from "../lib/worktree.js";

/** Name of the configuration directory */
const CONFIG_DIR_NAME = ".opencode-flow";

/** Get the directory where templates are stored (dist/templates/) */
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "templates");

/**
 * Load a template file from the templates directory.
 */
async function loadTemplate(relativePath: string): Promise<string> {
	return readFile(join(TEMPLATES_DIR, relativePath), "utf-8");
}

/**
 * Initialize opencode-flow configuration in the current repository.
 */
async function initAction(): Promise<void> {
	// Verify we're in a git repository
	let gitRoot: string;

	try {
		gitRoot = await getGitRoot();
	} catch {
		console.error(chalk.red("Error: Not in a git repository."));
		console.error("Please run this command from within a git repository.");
		process.exit(1);
	}

	// Check if we're in the git root (or bare repo root)
	const cwd = process.cwd();

	if (cwd !== gitRoot) {
		console.error(chalk.red("Error: Not in the git root directory."));
		console.error(`Please run this command from: ${gitRoot}`);
		process.exit(1);
	}

	const configDir = join(gitRoot, CONFIG_DIR_NAME);
	const agentsDir = join(configDir, "agents");

	// Check if already initialized
	if (existsSync(configDir)) {
		console.error(chalk.yellow(`${CONFIG_DIR_NAME}/ already exists.`));
		console.error("Remove it first if you want to re-initialize.");
		process.exit(1);
	}

	// Load templates
	const [pipelineYaml, buildPrompt, testPrompt, reviewPrompt, gitignoreContent] =
		await Promise.all([
			loadTemplate("pipeline.yaml"),
			loadTemplate("agents/build.md"),
			loadTemplate("agents/test.md"),
			loadTemplate("agents/review.md"),
			loadTemplate("gitignore"),
		]);

	// Create directory structure
	await mkdir(agentsDir, { recursive: true });

	// Write files
	const files = [
		{ path: join(configDir, "pipeline.yaml"), content: pipelineYaml },
		{ path: join(configDir, "agents", "build.md"), content: buildPrompt },
		{ path: join(configDir, "agents", "test.md"), content: testPrompt },
		{ path: join(configDir, "agents", "review.md"), content: reviewPrompt },
		{ path: join(configDir, ".gitignore"), content: gitignoreContent },
	];

	for (const file of files) {
		await writeFile(file.path, file.content, "utf-8");
		const relativePath = file.path.replace(gitRoot + "/", "");
		console.log(chalk.green("\u2713") + ` Created ${relativePath}`);
	}

	console.log();
	console.log(
		chalk.green("opencode-flow initialized!") +
			` Edit ${CONFIG_DIR_NAME}/pipeline.yaml to configure your pipeline.`,
	);
}

export const initCommand = new Command("init")
	.description("Initialize opencode-flow configuration in the current repository")
	.action(initAction);
