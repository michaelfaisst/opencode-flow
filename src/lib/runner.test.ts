import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { runPipeline, RunnerError } from "./runner.js";
import { saveRunState, createRunState } from "./state.js";
import { createWorktree } from "./worktree.js";
import type { PipelineConfig } from "../types.js";

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
 * Helper to initialize a regular git repo with an initial commit
 */
function initRegularRepo(dir: string): void {
	execSync("git init", { cwd: dir, stdio: "ignore" });
	execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "ignore" });
	execSync("git config user.name 'Test'", { cwd: dir, stdio: "ignore" });
	execSync("touch .gitkeep", { cwd: dir, stdio: "ignore" });
	execSync("git add .", { cwd: dir, stdio: "ignore" });
	execSync("git commit -m 'initial'", { cwd: dir, stdio: "ignore" });
}

/**
 * Create a minimal pipeline config for testing
 */
function createTestConfig(): PipelineConfig {
	return {
		settings: {
			defaultModel: "anthropic/claude-sonnet-4-20250514",
		},
		agents: [
			{
				name: "build",
				promptPath: "./agents/build.md",
			},
		],
	};
}

describe("RunnerError", () => {
	it("has correct name", () => {
		const error = new RunnerError("test message");
		expect(error.name).toBe("RunnerError");
		expect(error.message).toBe("test message");
	});
});

describe("runPipeline - skip scenarios", () => {
	let testDir: string;
	let configDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		initRegularRepo(testDir);
		configDir = join(testDir, ".opencode-flow");
		mkdirSync(configDir);
		mkdirSync(join(configDir, "agents"));
		writeFileSync(join(configDir, "agents", "build.md"), "# Build Agent for {{storyId}}");
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("skips when run state already exists", async () => {
		const config = createTestConfig();

		// Create an existing run state
		const existingState = createRunState("DEV-18", "flow/DEV-18", "/path/to/DEV-18");
		await saveRunState(existingState, configDir);

		const result = await runPipeline("DEV-18", config, configDir, testDir);

		expect(result.status).toBe("skipped");
		expect(result.skipReason).toBe("run already exists");
	});

	it("skips when worktree already exists", async () => {
		const config = createTestConfig();

		// Create an existing worktree
		await createWorktree("DEV-18", testDir);

		const result = await runPipeline("DEV-18", config, configDir, testDir);

		expect(result.status).toBe("skipped");
		expect(result.skipReason).toBe("worktree already exists");
	});
});
