import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { RunState } from "../types.js";
import { findConfigDir } from "./config.js";

/** Name of the runs directory within .opencode-flow */
const RUNS_DIR_NAME = "runs";

/**
 * Error thrown when state operations fail
 */
export class StateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StateError";
	}
}

/**
 * Get the path to the runs directory.
 * @param configDir - Optional config directory path, will be found if not provided
 * @returns Absolute path to the runs directory
 */
export function getRunsDir(configDir?: string): string {
	const dir = configDir ?? findConfigDir();
	return join(dir, RUNS_DIR_NAME);
}

/**
 * Ensure the runs directory exists.
 * @param runsDir - Path to the runs directory
 */
async function ensureRunsDir(runsDir: string): Promise<void> {
	if (!existsSync(runsDir)) {
		await mkdir(runsDir, { recursive: true });
	}
}

/**
 * Get the path to a run state file.
 * @param storyId - The story ID
 * @param runsDir - Path to the runs directory
 * @returns Path to the run state JSON file
 */
function getRunStatePath(storyId: string, runsDir: string): string {
	return join(runsDir, `${storyId}.json`);
}

/**
 * Load an existing run state for a story.
 * @param storyId - The story ID to load
 * @param configDir - Optional config directory path
 * @returns The run state if it exists, null otherwise
 */
export async function loadRunState(storyId: string, configDir?: string): Promise<RunState | null> {
	const runsDir = getRunsDir(configDir);
	const statePath = getRunStatePath(storyId, runsDir);

	if (!existsSync(statePath)) {
		return null;
	}

	try {
		const content = await readFile(statePath, "utf-8");
		return JSON.parse(content) as RunState;
	} catch (error) {
		throw new StateError(
			`Failed to load run state for ${storyId}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Save a run state to disk.
 * @param state - The run state to save
 * @param configDir - Optional config directory path
 */
export async function saveRunState(state: RunState, configDir?: string): Promise<void> {
	const runsDir = getRunsDir(configDir);
	await ensureRunsDir(runsDir);

	const statePath = getRunStatePath(state.storyId, runsDir);

	try {
		const content = JSON.stringify(state, null, 2);
		await writeFile(statePath, content, "utf-8");
	} catch (error) {
		throw new StateError(
			`Failed to save run state for ${state.storyId}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * List all run states.
 * @param configDir - Optional config directory path
 * @returns Array of all run states, sorted by updatedAt (most recent first)
 */
export async function listRuns(configDir?: string): Promise<RunState[]> {
	const runsDir = getRunsDir(configDir);

	if (!existsSync(runsDir)) {
		return [];
	}

	const files = await readdir(runsDir);
	const jsonFiles = files.filter((f) => f.endsWith(".json"));

	const states: RunState[] = [];

	for (const file of jsonFiles) {
		try {
			const content = await readFile(join(runsDir, file), "utf-8");
			states.push(JSON.parse(content) as RunState);
		} catch {
			// Skip invalid files silently
		}
	}

	// Sort by updatedAt, most recent first
	return states.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Delete a run state file.
 * @param storyId - The story ID to delete
 * @param configDir - Optional config directory path
 * @returns true if the file was deleted, false if it didn't exist
 */
export async function deleteRunState(storyId: string, configDir?: string): Promise<boolean> {
	const runsDir = getRunsDir(configDir);
	const statePath = getRunStatePath(storyId, runsDir);

	if (!existsSync(statePath)) {
		return false;
	}

	try {
		await rm(statePath);
		return true;
	} catch (error) {
		throw new StateError(
			`Failed to delete run state for ${storyId}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Check if a run state exists for a story.
 * @param storyId - The story ID to check
 * @param configDir - Optional config directory path
 * @returns true if a run state exists
 */
export function runStateExists(storyId: string, configDir?: string): boolean {
	const runsDir = getRunsDir(configDir);
	const statePath = getRunStatePath(storyId, runsDir);
	return existsSync(statePath);
}

/**
 * Create a new run state for a story.
 * @param storyId - The story ID
 * @param branch - The git branch name
 * @param worktreePath - Absolute path to the worktree
 * @returns The new run state
 */
export function createRunState(storyId: string, branch: string, worktreePath: string): RunState {
	const now = new Date().toISOString();
	return {
		storyId,
		branch,
		worktreePath,
		status: "pending",
		currentAgent: null,
		completedAgents: [],
		startedAt: now,
		updatedAt: now,
		error: null,
	};
}
