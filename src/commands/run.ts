import { Command } from "commander";
import chalk from "chalk";

import { loadConfig } from "../lib/config.js";
import { runPipeline } from "../lib/runner.js";
import { isBareRepo, getGitRoot } from "../lib/worktree.js";

import type { PipelineResult } from "../types.js";

/**
 * Display a separator line
 */
function printSeparator(): void {
	console.log(chalk.gray("\u2501".repeat(57)));
}

/**
 * Display the summary of all pipeline results
 */
function printSummary(results: PipelineResult[]): void {
	printSeparator();
	console.log(chalk.bold("Summary"));
	printSeparator();

	let completed = 0;
	let failed = 0;
	let skipped = 0;

	for (const result of results) {
		switch (result.status) {
			case "completed":
				completed++;
				console.log(chalk.green("\u2713") + ` ${result.storyId}: completed`);
				break;
			case "failed":
				failed++;
				console.log(
					chalk.red("\u2717") +
						` ${result.storyId}: failed` +
						(result.failedAgent ? ` (agent: ${result.failedAgent})` : ""),
				);
				break;
			case "skipped":
				skipped++;
				console.log(
					chalk.yellow("\u2298") +
						` ${result.storyId}: skipped` +
						(result.skipReason ? ` (${result.skipReason})` : ""),
				);
				break;
		}
	}

	console.log();
	console.log(`${completed}/${results.length} pipelines completed successfully`);
	if (failed > 0 || skipped > 0) {
		const parts: string[] = [];
		if (failed > 0) parts.push(`${failed} failed`);
		if (skipped > 0) parts.push(`${skipped} skipped`);
		console.log(parts.join(", "));
	}
}

/**
 * Run the pipeline for one or more stories
 */
async function runAction(storyIds: string[]): Promise<void> {
	// Validate that at least one story ID was provided
	if (storyIds.length === 0) {
		console.error(chalk.red("Error: At least one story ID is required."));
		process.exit(1);
	}

	// Load and validate configuration
	let config;
	let configDir: string;
	try {
		const result = await loadConfig();
		config = result.config;
		configDir = result.configDir;
	} catch (error) {
		console.error(
			chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`),
		);
		process.exit(1);
	}

	// Get the git root directory
	let gitRoot: string;
	try {
		gitRoot = await getGitRoot();
	} catch {
		console.error(chalk.red("Error: Not in a git repository."));
		process.exit(1);
	}

	// Check if it's a bare repo (warn if not)
	const isBare = await isBareRepo(gitRoot);
	if (!isBare) {
		console.log(
			chalk.yellow("Warning: Not a bare repository. Worktrees work best with bare repos."),
		);
		console.log();
	}

	// Print header
	const storyList = storyIds.join(", ");
	console.log(
		chalk.cyan("\u25D0") +
			` Running pipeline for ${storyIds.length} ${storyIds.length === 1 ? "story" : "stories"}: ${storyList}`,
	);
	console.log();

	// Process each story sequentially
	const results: PipelineResult[] = [];

	for (let i = 0; i < storyIds.length; i++) {
		const storyId = storyIds[i];

		printSeparator();
		console.log(chalk.bold(`[${i + 1}/${storyIds.length}] ${storyId}`));
		printSeparator();
		console.log();

		// Reset to git root before processing each story
		process.chdir(gitRoot);

		// Run the pipeline
		const result = await runPipeline(storyId, config, configDir, gitRoot);

		// Log the immediate result
		switch (result.status) {
			case "completed":
				console.log();
				console.log(chalk.green("\u2713") + ` Pipeline completed for ${storyId}`);
				break;
			case "failed":
				console.log();
				console.log(
					chalk.red("\u2717") +
						` Pipeline failed for ${storyId}` +
						(result.error ? `: ${result.error}` : ""),
				);
				break;
			case "skipped":
				console.log(chalk.yellow("\u2298") + ` Skipping ${storyId}: ${result.skipReason}`);
				break;
		}

		console.log();
		results.push(result);
	}

	// Print summary
	printSummary(results);

	// Exit with appropriate code
	// Only fail (exit 1) if there are actual failures, not skips
	const hasFailed = results.some((r) => r.status === "failed");
	process.exit(hasFailed ? 1 : 0);
}

export const runCommand = new Command("run")
	.description("Run the pipeline for one or more Linear stories")
	.argument("<storyId...>", "One or more Linear story IDs to process")
	.action(runAction);
