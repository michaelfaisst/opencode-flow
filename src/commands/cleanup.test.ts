import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createRunState, saveRunState } from "../lib/state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, "../../dist/index.js");

/**
 * Helper to create a temporary test directory
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
 * Helper to set up a test environment with config
 */
function setupTestEnvironment(testDir: string): string {
	initRegularRepo(testDir);
	const configDir = join(testDir, ".opencode-flow");
	mkdirSync(configDir);
	mkdirSync(join(configDir, "agents"));

	writeFileSync(
		join(configDir, "pipeline.yaml"),
		`settings:
  defaultModel: anthropic/claude-sonnet-4-20250514
agents:
  - name: build
    promptPath: ./agents/build.md
`,
	);

	writeFileSync(join(configDir, "agents", "build.md"), "# Build Agent for {{storyId}}");

	return configDir;
}

describe("cleanup command", () => {
	let testDir: string;
	let configDir: string;
	let originalCwd: string;

	beforeEach(() => {
		testDir = createTestDir();
		originalCwd = process.cwd();
		configDir = setupTestEnvironment(testDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		cleanupTestDir(testDir);
	});

	it("removes worktree and run state", async () => {
		process.chdir(testDir);

		// Create a worktree
		execSync("git worktree add -b flow/DEV-18 DEV-18", { cwd: testDir, stdio: "ignore" });

		// Create a run state
		await saveRunState(
			createRunState("DEV-18", "flow/DEV-18", join(testDir, "DEV-18")),
			configDir,
		);

		// Verify they exist
		expect(existsSync(join(testDir, "DEV-18"))).toBe(true);
		expect(existsSync(join(configDir, "runs", "DEV-18.json"))).toBe(true);

		// Run cleanup
		const result = execSync(`bun ${CLI_PATH} cleanup DEV-18`, {
			cwd: testDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		expect(result).toContain("Worktree removed");
		expect(result).toContain("Run state deleted");
		expect(result).toContain("Cleanup complete");

		// Verify they are gone
		expect(existsSync(join(testDir, "DEV-18"))).toBe(false);
		expect(existsSync(join(configDir, "runs", "DEV-18.json"))).toBe(false);
	});

	it("preserves run state with --keep-state flag", async () => {
		process.chdir(testDir);

		// Create a worktree
		execSync("git worktree add -b flow/DEV-19 DEV-19", { cwd: testDir, stdio: "ignore" });

		// Create a run state
		await saveRunState(
			createRunState("DEV-19", "flow/DEV-19", join(testDir, "DEV-19")),
			configDir,
		);

		// Run cleanup with --keep-state
		const result = execSync(`bun ${CLI_PATH} cleanup DEV-19 --keep-state`, {
			cwd: testDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		expect(result).toContain("Worktree removed");
		expect(result).toContain("preserved");
		expect(result).toContain("Cleanup complete");

		// Verify worktree is gone but state remains
		expect(existsSync(join(testDir, "DEV-19"))).toBe(false);
		expect(existsSync(join(configDir, "runs", "DEV-19.json"))).toBe(true);
	});

	it("fails when nothing exists to clean up", () => {
		process.chdir(testDir);

		let failed = false;
		try {
			execSync(`bun ${CLI_PATH} cleanup DEV-NONEXISTENT`, {
				cwd: testDir,
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			});
		} catch {
			failed = true;
		}

		expect(failed).toBe(true);
	});

	it("can clean up run state only (no worktree)", async () => {
		process.chdir(testDir);

		// Create only a run state (no worktree)
		await saveRunState(createRunState("DEV-20", "flow/DEV-20", "/nonexistent/path"), configDir);

		// Verify state exists
		expect(existsSync(join(configDir, "runs", "DEV-20.json"))).toBe(true);

		// Run cleanup
		const result = execSync(`bun ${CLI_PATH} cleanup DEV-20`, {
			cwd: testDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		expect(result).toContain("Run state deleted");
		expect(result).toContain("Cleanup complete");

		// Verify state is gone
		expect(existsSync(join(configDir, "runs", "DEV-20.json"))).toBe(false);
	});
});
