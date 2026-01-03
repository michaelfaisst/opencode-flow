import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import {
	isBareRepo,
	getGitRoot,
	worktreeExists,
	getBranchName,
	createWorktree,
	removeWorktree,
	WorktreeError,
} from "./worktree.js";

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
 * Helper to initialize a bare git repo
 */
function initBareRepo(dir: string): void {
	execSync("git init --bare", { cwd: dir, stdio: "ignore" });
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

describe("getBranchName", () => {
	it("returns branch name in flow/<storyId> format", () => {
		expect(getBranchName("DEV-18")).toBe("flow/DEV-18");
		expect(getBranchName("PROJ-123")).toBe("flow/PROJ-123");
	});
});

describe("isBareRepo", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("returns true for a bare repo", async () => {
		initBareRepo(testDir);
		const result = await isBareRepo(testDir);
		expect(result).toBe(true);
	});

	it("returns false for a regular repo", async () => {
		initRegularRepo(testDir);
		const result = await isBareRepo(testDir);
		expect(result).toBe(false);
	});

	it("returns false for a non-git directory", async () => {
		const result = await isBareRepo(testDir);
		expect(result).toBe(false);
	});
});

describe("getGitRoot", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("returns the git root for a regular repo", async () => {
		initRegularRepo(testDir);
		const result = await getGitRoot(testDir);
		expect(result).toBe(testDir);
	});

	it("returns the git root from a subdirectory", async () => {
		initRegularRepo(testDir);
		const subDir = join(testDir, "src", "lib");
		mkdirSync(subDir, { recursive: true });

		const result = await getGitRoot(subDir);
		expect(result).toBe(testDir);
	});

	it("returns the git root for a bare repo", async () => {
		initBareRepo(testDir);
		const result = await getGitRoot(testDir);
		expect(result).toBe(testDir);
	});
});

describe("worktreeExists", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		initRegularRepo(testDir);
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("returns false when worktree does not exist", async () => {
		const result = await worktreeExists("DEV-18", testDir);
		expect(result).toBe(false);
	});

	it("returns true after worktree is created", async () => {
		await createWorktree("DEV-18", testDir);
		const result = await worktreeExists("DEV-18", testDir);
		expect(result).toBe(true);
	});
});

describe("createWorktree", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		initRegularRepo(testDir);
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("creates a worktree and returns the path", async () => {
		const result = await createWorktree("DEV-18", testDir);

		expect(result).toBe(join(testDir, "DEV-18"));
		expect(await worktreeExists("DEV-18", testDir)).toBe(true);
	});

	it("creates the branch with correct name", async () => {
		await createWorktree("DEV-18", testDir);

		// Check that the branch exists
		const branches = execSync("git branch --list", { cwd: testDir, encoding: "utf-8" });
		expect(branches).toContain("flow/DEV-18");
	});

	it("throws WorktreeError when worktree already exists", async () => {
		await createWorktree("DEV-18", testDir);

		await expect(createWorktree("DEV-18", testDir)).rejects.toThrow(WorktreeError);
		await expect(createWorktree("DEV-18", testDir)).rejects.toThrow("Worktree already exists");
	});
});

describe("removeWorktree", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		initRegularRepo(testDir);
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("removes an existing worktree", async () => {
		await createWorktree("DEV-18", testDir);
		expect(await worktreeExists("DEV-18", testDir)).toBe(true);

		await removeWorktree("DEV-18", testDir);
		expect(await worktreeExists("DEV-18", testDir)).toBe(false);
	});

	it("removes the branch by default", async () => {
		await createWorktree("DEV-18", testDir);
		await removeWorktree("DEV-18", testDir);

		const branches = execSync("git branch --list", { cwd: testDir, encoding: "utf-8" });
		expect(branches).not.toContain("flow/DEV-18");
	});

	it("keeps the branch when deleteBranch is false", async () => {
		await createWorktree("DEV-18", testDir);
		await removeWorktree("DEV-18", testDir, false);

		const branches = execSync("git branch --list", { cwd: testDir, encoding: "utf-8" });
		expect(branches).toContain("flow/DEV-18");
	});

	it("does not throw when worktree does not exist", async () => {
		// Should not throw
		await expect(removeWorktree("NONEXISTENT", testDir)).resolves.not.toThrow();
	});
});
