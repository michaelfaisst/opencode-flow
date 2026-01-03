import { Command } from "commander";
import chalk from "chalk";

import { findConfigDir } from "../lib/config.js";
import { deleteRunState, runStateExists } from "../lib/state.js";
import { getGitRoot, removeWorktree, worktreeExists } from "../lib/worktree.js";

interface CleanupOptions {
	keepState: boolean;
}

/**
 * Remove a worktree and optionally delete run state
 */
async function cleanupAction(storyId: string, options: CleanupOptions): Promise<void> {
	// Find config directory
	let configDir: string;

	try {
		configDir = findConfigDir();
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

	// Check if there's anything to clean up
	const hasWorktree = await worktreeExists(storyId, gitRoot);
	const hasState = runStateExists(storyId, configDir);

	if (!hasWorktree && !hasState) {
		console.error(chalk.yellow(`No worktree or run state found for ${storyId}.`));
		process.exit(1);
	}

	// Remove worktree
	if (hasWorktree) {
		console.log(chalk.cyan("\u25D0") + ` Removing worktree ${storyId}...`);
		try {
			await removeWorktree(storyId, gitRoot);
			console.log(chalk.green("\u2713") + " Worktree removed");
		} catch (error) {
			console.error(
				chalk.red("\u2717") +
					` Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exit(1);
		}
	}

	// Delete run state
	if (hasState && !options.keepState) {
		try {
			await deleteRunState(storyId, configDir);
			console.log(chalk.green("\u2713") + " Run state deleted");
		} catch (error) {
			console.error(
				chalk.red("\u2717") +
					` Failed to delete run state: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exit(1);
		}
	} else if (hasState && options.keepState) {
		console.log(chalk.yellow("\u2298") + " Run state preserved (--keep-state)");
	}

	console.log();
	console.log(chalk.green(`Cleanup complete for ${storyId}`));
}

export const cleanupCommand = new Command("cleanup")
	.description("Remove a worktree and optionally delete run state")
	.argument("<storyId>", "The story ID to clean up")
	.option("--keep-state", "Don't delete the run state JSON file", false)
	.action(cleanupAction);
