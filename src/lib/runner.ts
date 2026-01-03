import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { AgentConfig, PipelineConfig, PipelineResult, RunState } from "../types.js";
import { createRunState, runStateExists, saveRunState } from "./state.js";
import { substituteVariables } from "./template.js";
import { createWorktree, getBranchName, worktreeExists } from "./worktree.js";

/**
 * Error thrown when runner operations fail
 */
export class RunnerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RunnerError";
	}
}

/**
 * Result of running a single agent
 */
export interface AgentResult {
	/** Whether the agent completed successfully */
	success: boolean;
	/** Exit code of the opencode process */
	exitCode: number;
}

/**
 * Get the effective model for an agent (agent-specific or default)
 */
function getEffectiveModel(agent: AgentConfig, config: PipelineConfig): string | undefined {
	return agent.model ?? config.settings?.defaultModel;
}

/**
 * Get the effective OpenCode agent for an agent (agent-specific or default)
 */
function getEffectiveAgent(agent: AgentConfig, config: PipelineConfig): string | undefined {
	return agent.agent ?? config.settings?.defaultAgent;
}

/**
 * Run a single agent via opencode.
 * @param agent - The agent configuration
 * @param config - The full pipeline configuration
 * @param configDir - Path to .opencode-flow directory
 * @param worktreePath - Path to the worktree
 * @param storyId - The story ID
 * @returns AgentResult with success status and exit code
 */
export async function runAgent(
	agent: AgentConfig,
	config: PipelineConfig,
	configDir: string,
	worktreePath: string,
	storyId: string,
): Promise<AgentResult> {
	// Read the prompt file
	const promptPath = resolve(configDir, agent.promptPath);
	let promptContent: string;

	try {
		promptContent = await readFile(promptPath, "utf-8");
	} catch (error) {
		throw new RunnerError(
			`Failed to read prompt file for agent ${agent.name}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	// Substitute template variables
	const branch = getBranchName(storyId);
	const { result: prompt, missingVariables } = substituteVariables(promptContent, {
		storyId,
		branch,
		worktreePath,
		agentName: agent.name,
	});

	// Warn about missing variables (but don't fail)
	if (missingVariables.length > 0) {
		console.warn(
			`Warning: Missing template variables in ${agent.promptPath}: ${missingVariables.join(", ")}`,
		);
	}

	// Build the opencode command arguments
	// Flags come before the positional prompt argument
	const args = ["run"];

	const model = getEffectiveModel(agent, config);
	if (model) {
		args.push("--model", model);
	}

	const agentName = getEffectiveAgent(agent, config);
	if (agentName) {
		args.push("--agent", agentName);
	}

	// Prompt comes last as the positional argument
	args.push(prompt);

	// Run opencode and stream output
	return new Promise((resolve) => {
		const proc = spawn("opencode", args, {
			cwd: worktreePath,
			stdio: ["ignore", "inherit", "inherit"],
		});

		proc.on("close", (code) => {
			const exitCode = code ?? 1;
			resolve({
				success: exitCode === 0,
				exitCode,
			});
		});

		proc.on("error", (err) => {
			console.error(`Failed to execute opencode: ${err.message}`);
			resolve({
				success: false,
				exitCode: 1,
			});
		});
	});
}

/**
 * Run the full pipeline for a single story.
 * @param storyId - The story ID to process
 * @param config - The pipeline configuration
 * @param configDir - Path to .opencode-flow directory
 * @param gitRoot - Path to git root directory
 * @returns PipelineResult indicating success, failure, or skip
 */
export async function runPipeline(
	storyId: string,
	config: PipelineConfig,
	configDir: string,
	gitRoot: string,
): Promise<PipelineResult> {
	// Check if run state already exists
	if (runStateExists(storyId, configDir)) {
		return {
			storyId,
			status: "skipped",
			skipReason: "run already exists",
		};
	}

	// Check if worktree already exists
	if (await worktreeExists(storyId, gitRoot)) {
		return {
			storyId,
			status: "skipped",
			skipReason: "worktree already exists",
		};
	}

	// Create the worktree
	let worktreePath: string;
	try {
		worktreePath = await createWorktree(storyId, gitRoot);
	} catch (error) {
		return {
			storyId,
			status: "failed",
			error: `Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	// Initialize run state
	const branch = getBranchName(storyId);
	let state: RunState = createRunState(storyId, branch, worktreePath);
	state.status = "in_progress";
	await saveRunState(state, configDir);

	// Run each agent sequentially
	for (const agent of config.agents) {
		// Update state to show current agent
		state = {
			...state,
			currentAgent: agent.name,
			updatedAt: new Date().toISOString(),
		};
		await saveRunState(state, configDir);

		// Run the agent
		const result = await runAgent(agent, config, configDir, worktreePath, storyId);

		if (!result.success) {
			// Mark as failed and stop
			state = {
				...state,
				status: "failed",
				currentAgent: null,
				error: `Agent ${agent.name} failed with exit code ${result.exitCode}`,
				updatedAt: new Date().toISOString(),
			};
			await saveRunState(state, configDir);

			return {
				storyId,
				status: "failed",
				failedAgent: agent.name,
				error: `Agent ${agent.name} failed with exit code ${result.exitCode}`,
			};
		}

		// Mark agent as completed
		state = {
			...state,
			completedAgents: [...state.completedAgents, agent.name],
			updatedAt: new Date().toISOString(),
		};
		await saveRunState(state, configDir);
	}

	// All agents completed successfully
	state = {
		...state,
		status: "completed",
		currentAgent: null,
		updatedAt: new Date().toISOString(),
	};
	await saveRunState(state, configDir);

	return {
		storyId,
		status: "completed",
	};
}
