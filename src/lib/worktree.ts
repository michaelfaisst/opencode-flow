import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Error thrown when worktree operations fail
 */
export class WorktreeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorktreeError";
	}
}

/**
 * Execute a git command and return the output
 */
async function execGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const proc = spawn("git", args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (data: Buffer) => {
			stdout += data.toString();
		});

		proc.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
			} else {
				reject(new WorktreeError(stderr.trim() || `git command failed with code ${code}`));
			}
		});

		proc.on("error", (err) => {
			reject(new WorktreeError(`Failed to execute git: ${err.message}`));
		});
	});
}

/**
 * Check if the given directory is a bare git repository.
 * @param dir - Directory to check
 * @returns true if the directory is a bare repo
 */
export async function isBareRepo(dir?: string): Promise<boolean> {
	try {
		const { stdout } = await execGit(["rev-parse", "--is-bare-repository"], dir);
		return stdout === "true";
	} catch {
		return false;
	}
}

/**
 * Get the git root directory.
 * @param startDir - Directory to start from
 * @returns Absolute path to the git root directory
 */
export async function getGitRoot(startDir?: string): Promise<string> {
	try {
		const { stdout } = await execGit(["rev-parse", "--show-toplevel"], startDir);
		return stdout;
	} catch {
		// For bare repos, --show-toplevel doesn't work, use --git-dir instead
		const { stdout } = await execGit(["rev-parse", "--git-dir"], startDir);
		const gitDir = resolve(startDir ?? process.cwd(), stdout);
		// For bare repos, the git dir is the repo root
		return gitDir;
	}
}

/**
 * Check if a worktree exists for the given story ID.
 * @param storyId - The story ID
 * @param gitRoot - Git root directory
 * @returns true if the worktree exists
 */
export async function worktreeExists(storyId: string, gitRoot: string): Promise<boolean> {
	const worktreePath = getWorktreePath(storyId, gitRoot);

	// Check if the directory exists
	if (!existsSync(worktreePath)) {
		return false;
	}

	// Also verify it's registered as a worktree
	try {
		const { stdout } = await execGit(["worktree", "list", "--porcelain"], gitRoot);
		return stdout.includes(`worktree ${worktreePath}`);
	} catch {
		return false;
	}
}

/**
 * Get the absolute path to a worktree for a story.
 * @param storyId - The story ID
 * @param gitRoot - Git root directory
 * @returns Absolute path to the worktree directory
 */
function getWorktreePath(storyId: string, gitRoot: string): string {
	return resolve(gitRoot, storyId);
}

/**
 * Get the branch name for a story.
 * @param storyId - The story ID
 * @returns Branch name in format flow/<storyId>
 */
export function getBranchName(storyId: string): string {
	return `flow/${storyId}`;
}

/**
 * Create a worktree for a story.
 * @param storyId - The story ID
 * @param gitRoot - Git root directory
 * @returns The absolute path to the created worktree
 */
export async function createWorktree(storyId: string, gitRoot: string): Promise<string> {
	const worktreePath = getWorktreePath(storyId, gitRoot);
	const branch = getBranchName(storyId);

	// Check if worktree already exists
	if (await worktreeExists(storyId, gitRoot)) {
		throw new WorktreeError(`Worktree already exists: ${worktreePath}`);
	}

	try {
		await execGit(["worktree", "add", "-b", branch, worktreePath], gitRoot);
		return worktreePath;
	} catch (error) {
		if (error instanceof WorktreeError) {
			throw error;
		}
		throw new WorktreeError(
			`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Remove a worktree for a story.
 * @param storyId - The story ID
 * @param gitRoot - Git root directory
 * @param deleteBranch - Whether to also delete the local branch (default: true)
 */
export async function removeWorktree(
	storyId: string,
	gitRoot: string,
	deleteBranch: boolean = true,
): Promise<void> {
	const worktreePath = getWorktreePath(storyId, gitRoot);
	const branch = getBranchName(storyId);

	// Remove the worktree
	try {
		await execGit(["worktree", "remove", worktreePath, "--force"], gitRoot);
	} catch (error) {
		if (error instanceof WorktreeError && !error.message.includes("is not a working tree")) {
			throw error;
		}
		// If the worktree doesn't exist, continue to try to delete the branch
	}

	// Delete the branch if requested
	if (deleteBranch) {
		try {
			await execGit(["branch", "-D", branch], gitRoot);
		} catch {
			// Branch might not exist or already deleted, ignore
		}
	}
}
