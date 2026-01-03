import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, realpathSync, writeFileSync } from "node:fs";
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

	writeFileSync(join(configDir, "agents", "build.md"), "# Build Agent for {{storyId}}");

	return configDir;
}

describe("status command", () => {
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

	it("shows message when no runs exist", () => {
		process.chdir(testDir);

		const result = execSync(`bun ${CLI_PATH} status`, {
			cwd: testDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		expect(result).toContain("No pipeline runs found");
	});

	it("displays runs in table format when runs exist", async () => {
		process.chdir(testDir);

		// Create some run states
		await saveRunState(createRunState("DEV-18", "flow/DEV-18", "/path/to/DEV-18"), configDir);
		await saveRunState(createRunState("DEV-19", "flow/DEV-19", "/path/to/DEV-19"), configDir);

		const result = execSync(`bun ${CLI_PATH} status`, {
			cwd: testDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Should contain table headers
		expect(result).toContain("Story ID");
		expect(result).toContain("Branch");
		expect(result).toContain("Status");

		// Should contain run data
		expect(result).toContain("DEV-18");
		expect(result).toContain("DEV-19");
		expect(result).toContain("flow/DEV-18");

		// Should show count
		expect(result).toContain("2 pipeline runs found");
	});

	it("shows singular 'run' when only one exists", async () => {
		process.chdir(testDir);

		await saveRunState(createRunState("DEV-18", "flow/DEV-18", "/path/to/DEV-18"), configDir);

		const result = execSync(`bun ${CLI_PATH} status`, {
			cwd: testDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		expect(result).toContain("1 pipeline run found");
	});
});
