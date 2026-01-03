import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, realpathSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
	getRunsDir,
	loadRunState,
	saveRunState,
	listRuns,
	deleteRunState,
	runStateExists,
	createRunState,
	StateError,
} from "./state.js";
import type { RunState } from "../types.js";

/**
 * Helper to create a temporary test directory structure
 */
function createTestDir(): string {
	const testDir = join(tmpdir(), `ocf-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(testDir, { recursive: true });
	return realpathSync(testDir);
}

/**
 * Helper to clean up test directory
 */
function cleanupTestDir(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

/**
 * Helper to create a test run state
 */
function createTestState(overrides?: Partial<RunState>): RunState {
	return {
		storyId: "DEV-18",
		branch: "flow/DEV-18",
		worktreePath: "/path/to/DEV-18",
		status: "pending",
		currentAgent: null,
		completedAgents: [],
		startedAt: "2025-01-15T10:00:00.000Z",
		updatedAt: "2025-01-15T10:00:00.000Z",
		error: null,
		...overrides,
	};
}

describe("getRunsDir", () => {
	let testDir: string;
	let configDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		configDir = join(testDir, ".opencode-flow");
		mkdirSync(configDir);
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("returns the runs directory path within config dir", () => {
		const result = getRunsDir(configDir);
		expect(result).toBe(join(configDir, "runs"));
	});
});

describe("createRunState", () => {
	it("creates a new run state with correct initial values", () => {
		const state = createRunState("DEV-18", "flow/DEV-18", "/path/to/DEV-18");

		expect(state.storyId).toBe("DEV-18");
		expect(state.branch).toBe("flow/DEV-18");
		expect(state.worktreePath).toBe("/path/to/DEV-18");
		expect(state.status).toBe("pending");
		expect(state.currentAgent).toBeNull();
		expect(state.completedAgents).toEqual([]);
		expect(state.error).toBeNull();
		// startedAt and updatedAt should be valid ISO timestamps
		expect(new Date(state.startedAt).getTime()).not.toBeNaN();
		expect(new Date(state.updatedAt).getTime()).not.toBeNaN();
	});
});

describe("saveRunState and loadRunState", () => {
	let testDir: string;
	let configDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		configDir = join(testDir, ".opencode-flow");
		mkdirSync(configDir);
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("saves and loads a run state", async () => {
		const state = createTestState();

		await saveRunState(state, configDir);
		const loaded = await loadRunState("DEV-18", configDir);

		expect(loaded).toEqual(state);
	});

	it("creates the runs directory if it does not exist", async () => {
		const state = createTestState();
		const runsDir = join(configDir, "runs");

		expect(existsSync(runsDir)).toBe(false);

		await saveRunState(state, configDir);

		expect(existsSync(runsDir)).toBe(true);
	});

	it("returns null when run state does not exist", async () => {
		const result = await loadRunState("NONEXISTENT", configDir);
		expect(result).toBeNull();
	});

	it("overwrites existing run state on save", async () => {
		const state1 = createTestState({ status: "pending" });
		await saveRunState(state1, configDir);

		const state2 = createTestState({ status: "in_progress", currentAgent: "build" });
		await saveRunState(state2, configDir);

		const loaded = await loadRunState("DEV-18", configDir);
		expect(loaded?.status).toBe("in_progress");
		expect(loaded?.currentAgent).toBe("build");
	});

	it("throws StateError when loading corrupted JSON", async () => {
		const runsDir = join(configDir, "runs");
		mkdirSync(runsDir, { recursive: true });
		writeFileSync(join(runsDir, "DEV-18.json"), "invalid json {");

		await expect(loadRunState("DEV-18", configDir)).rejects.toThrow(StateError);
		await expect(loadRunState("DEV-18", configDir)).rejects.toThrow(
			"Failed to load run state for DEV-18",
		);
	});
});

describe("listRuns", () => {
	let testDir: string;
	let configDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		configDir = join(testDir, ".opencode-flow");
		mkdirSync(configDir);
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("returns empty array when no runs exist", async () => {
		const result = await listRuns(configDir);
		expect(result).toEqual([]);
	});

	it("returns empty array when runs directory does not exist", async () => {
		const result = await listRuns(configDir);
		expect(result).toEqual([]);
	});

	it("lists all run states", async () => {
		const state1 = createTestState({
			storyId: "DEV-18",
			updatedAt: "2025-01-15T10:00:00.000Z",
		});
		const state2 = createTestState({
			storyId: "DEV-19",
			updatedAt: "2025-01-15T11:00:00.000Z",
		});

		await saveRunState(state1, configDir);
		await saveRunState(state2, configDir);

		const result = await listRuns(configDir);

		expect(result).toHaveLength(2);
		expect(result.map((s) => s.storyId)).toEqual(["DEV-19", "DEV-18"]);
	});

	it("sorts runs by updatedAt (most recent first)", async () => {
		const state1 = createTestState({
			storyId: "DEV-18",
			updatedAt: "2025-01-15T12:00:00.000Z",
		});
		const state2 = createTestState({
			storyId: "DEV-19",
			updatedAt: "2025-01-15T10:00:00.000Z",
		});
		const state3 = createTestState({
			storyId: "DEV-20",
			updatedAt: "2025-01-15T11:00:00.000Z",
		});

		await saveRunState(state1, configDir);
		await saveRunState(state2, configDir);
		await saveRunState(state3, configDir);

		const result = await listRuns(configDir);

		expect(result.map((s) => s.storyId)).toEqual(["DEV-18", "DEV-20", "DEV-19"]);
	});

	it("skips invalid JSON files", async () => {
		const runsDir = join(configDir, "runs");
		mkdirSync(runsDir, { recursive: true });

		const validState = createTestState({ storyId: "DEV-18" });
		await saveRunState(validState, configDir);

		writeFileSync(join(runsDir, "invalid.json"), "not valid json");

		const result = await listRuns(configDir);

		expect(result).toHaveLength(1);
		expect(result[0]?.storyId).toBe("DEV-18");
	});
});

describe("deleteRunState", () => {
	let testDir: string;
	let configDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		configDir = join(testDir, ".opencode-flow");
		mkdirSync(configDir);
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("deletes an existing run state and returns true", async () => {
		const state = createTestState();
		await saveRunState(state, configDir);

		const deleted = await deleteRunState("DEV-18", configDir);

		expect(deleted).toBe(true);
		expect(await loadRunState("DEV-18", configDir)).toBeNull();
	});

	it("returns false when run state does not exist", async () => {
		const deleted = await deleteRunState("NONEXISTENT", configDir);
		expect(deleted).toBe(false);
	});
});

describe("runStateExists", () => {
	let testDir: string;
	let configDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		configDir = join(testDir, ".opencode-flow");
		mkdirSync(configDir);
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("returns true when run state exists", async () => {
		const state = createTestState();
		await saveRunState(state, configDir);

		expect(runStateExists("DEV-18", configDir)).toBe(true);
	});

	it("returns false when run state does not exist", () => {
		expect(runStateExists("NONEXISTENT", configDir)).toBe(false);
	});

	it("returns false when runs directory does not exist", () => {
		expect(runStateExists("DEV-18", configDir)).toBe(false);
	});
});
