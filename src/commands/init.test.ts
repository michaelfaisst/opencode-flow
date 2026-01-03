import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, realpathSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

describe("init command", () => {
	let testDir: string;
	let originalCwd: string;

	beforeEach(() => {
		testDir = createTestDir();
		originalCwd = process.cwd();
		initRegularRepo(testDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		cleanupTestDir(testDir);
	});

	it("creates correct directory structure when run from git root", () => {
		process.chdir(testDir);

		// Run the CLI command directly
		execSync(`bun ${CLI_PATH} init`, {
			cwd: testDir,
			stdio: "pipe",
		});

		// Verify directory structure
		const configDir = join(testDir, ".opencode-flow");
		expect(existsSync(configDir)).toBe(true);
		expect(existsSync(join(configDir, "pipeline.yaml"))).toBe(true);
		expect(existsSync(join(configDir, "agents"))).toBe(true);
		expect(existsSync(join(configDir, "agents", "build.md"))).toBe(true);
		expect(existsSync(join(configDir, "agents", "test.md"))).toBe(true);
		expect(existsSync(join(configDir, "agents", "review.md"))).toBe(true);
		expect(existsSync(join(configDir, ".gitignore"))).toBe(true);
	});

	it("creates valid pipeline.yaml with correct structure", () => {
		process.chdir(testDir);

		execSync(`bun ${CLI_PATH} init`, {
			cwd: testDir,
			stdio: "pipe",
		});

		const pipelineContent = readFileSync(
			join(testDir, ".opencode-flow", "pipeline.yaml"),
			"utf-8",
		);

		// Verify it contains key configuration elements
		expect(pipelineContent).toContain("settings:");
		expect(pipelineContent).toContain("agents:");
		expect(pipelineContent).toContain("defaultModel:");
		expect(pipelineContent).toContain("promptPath:");
	});

	it("agent prompts contain template variables", () => {
		process.chdir(testDir);

		execSync(`bun ${CLI_PATH} init`, {
			cwd: testDir,
			stdio: "pipe",
		});

		const buildPrompt = readFileSync(
			join(testDir, ".opencode-flow", "agents", "build.md"),
			"utf-8",
		);

		// Verify template variables are present
		expect(buildPrompt).toContain("{{storyId}}");
		expect(buildPrompt).toContain("{{branch}}");
		expect(buildPrompt).toContain("{{worktreePath}}");
	});

	it("fails when already initialized", () => {
		process.chdir(testDir);

		// First init
		execSync(`bun ${CLI_PATH} init`, {
			cwd: testDir,
			stdio: "pipe",
		});

		// Second init should fail
		let failed = false;
		try {
			execSync(`bun ${CLI_PATH} init`, {
				cwd: testDir,
				stdio: "pipe",
			});
		} catch {
			failed = true;
		}

		expect(failed).toBe(true);
	});

	it("gitignore contains runs/", () => {
		process.chdir(testDir);

		execSync(`bun ${CLI_PATH} init`, {
			cwd: testDir,
			stdio: "pipe",
		});

		const gitignoreContent = readFileSync(
			join(testDir, ".opencode-flow", ".gitignore"),
			"utf-8",
		);
		expect(gitignoreContent).toContain("runs/");
	});
});
