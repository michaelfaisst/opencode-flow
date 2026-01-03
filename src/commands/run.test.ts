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

	// Create a minimal pipeline.yaml
	writeFileSync(
		join(configDir, "pipeline.yaml"),
		`settings:
  defaultModel: anthropic/claude-sonnet-4-20250514
agents:
  - name: build
    promptPath: ./agents/build.md
`,
	);

	// Create a minimal prompt
	writeFileSync(join(configDir, "agents", "build.md"), "# Build Agent for {{storyId}}");

	return configDir;
}

describe("run command", () => {
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

	it("skips when run state already exists", async () => {
		process.chdir(testDir);

		// Create an existing run state
		const existingState = createRunState("DEV-18", "flow/DEV-18", "/path/to/DEV-18");
		await saveRunState(existingState, configDir);

		// Run the command
		const result = execSync(`bun ${CLI_PATH} run DEV-18`, {
			cwd: testDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		expect(result).toContain("skipped");
		expect(result).toContain("run already exists");
	});

	it("skips when worktree already exists", () => {
		process.chdir(testDir);

		// Create an existing worktree manually
		execSync("git worktree add -b flow/DEV-19 DEV-19", { cwd: testDir, stdio: "ignore" });

		// Run the command
		const result = execSync(`bun ${CLI_PATH} run DEV-19`, {
			cwd: testDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		expect(result).toContain("skipped");
		expect(result).toContain("worktree already exists");
	});

	it("creates worktree for new story", () => {
		process.chdir(testDir);

		// Replace opencode with a mock that succeeds immediately
		const mockedPrompt = "# Build Agent\nTest\nexit 0";
		writeFileSync(join(configDir, "agents", "build.md"), mockedPrompt);

		// For this test, we need to mock opencode
		// Since opencode is not available in test environment, we'll check worktree creation
		// by expecting the command to attempt worktree creation before failing on opencode

		try {
			execSync(`bun ${CLI_PATH} run DEV-20`, {
				cwd: testDir,
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
				timeout: 5000,
			});
		} catch {
			// Expected to fail because opencode isn't available
		}

		// Verify worktree was created
		expect(existsSync(join(testDir, "DEV-20"))).toBe(true);
	});

	it("processes multiple stories sequentially", async () => {
		process.chdir(testDir);

		// Create existing run states to cause skips
		await saveRunState(createRunState("DEV-A", "flow/DEV-A", "/path/to/DEV-A"), configDir);
		await saveRunState(createRunState("DEV-B", "flow/DEV-B", "/path/to/DEV-B"), configDir);

		// Run with multiple stories
		const result = execSync(`bun ${CLI_PATH} run DEV-A DEV-B`, {
			cwd: testDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Both should be skipped with appropriate messaging
		expect(result).toContain("DEV-A");
		expect(result).toContain("DEV-B");
		expect(result).toContain("skipped");
		// Summary should appear
		expect(result).toContain("Summary");
	});

	it("displays summary at the end", async () => {
		process.chdir(testDir);

		// Create an existing run state
		await saveRunState(createRunState("DEV-X", "flow/DEV-X", "/path/to/DEV-X"), configDir);

		const result = execSync(`bun ${CLI_PATH} run DEV-X`, {
			cwd: testDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		expect(result).toContain("Summary");
		expect(result).toContain("0/1 pipelines completed successfully");
	});
});
