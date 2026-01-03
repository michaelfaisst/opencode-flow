import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { format } from "date-fns";

import { findConfigDir } from "../lib/config.js";
import { listRuns } from "../lib/state.js";

import type { RunState, RunStatus } from "../types.js";

/**
 * Format a date for display
 */
function formatDate(isoDate: string): string {
	return format(new Date(isoDate), "MM/dd/yyyy, HH:mm:ss");
}

/**
 * Get the status display with color
 */
function formatStatus(status: RunStatus): string {
	switch (status) {
		case "completed":
			return chalk.green(status);
		case "failed":
			return chalk.red(status);
		case "in_progress":
			return chalk.cyan(status);
		case "pending":
			return chalk.yellow(status);
		default:
			return status;
	}
}

/**
 * Display pipeline runs in a table format
 */
function displayTable(runs: RunState[]): void {
	const table = new Table({
		head: ["Story ID", "Branch", "Status", "Current Agent", "Started"],
		colWidths: [14, 22, 16, 18, 24],
	});

	for (const run of runs) {
		table.push([
			run.storyId,
			run.branch,
			formatStatus(run.status),
			run.currentAgent ?? "-",
			formatDate(run.startedAt),
		]);
	}

	console.log(table.toString());
}

/**
 * Show all pipeline runs and their status
 */
async function statusAction(): Promise<void> {
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

	// Load all runs
	const runs = await listRuns(configDir);

	if (runs.length === 0) {
		console.log("No pipeline runs found.");
		console.log();
		console.log(`Run ${chalk.cyan("ocf run <storyId>")} to start a pipeline.`);
		return;
	}

	// Display the table
	displayTable(runs);

	console.log();
	console.log(`${runs.length} pipeline run${runs.length === 1 ? "" : "s"} found`);
}

export const statusCommand = new Command("status")
	.description("Show all pipeline runs and their status")
	.action(statusAction);
