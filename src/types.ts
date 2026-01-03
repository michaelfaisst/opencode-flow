/**
 * Global settings for the pipeline configuration
 */
export interface Settings {
	/** Default model for all agents (optional) - format: provider/model */
	defaultModel?: string;
	/** Default OpenCode agent for all agents (optional) */
	defaultAgent?: string;
}

/**
 * Configuration for a single agent in the pipeline
 */
export interface AgentConfig {
	/** Unique name for this agent */
	name: string;
	/** Path to prompt markdown file (relative to .opencode-flow/) */
	promptPath: string;
	/** Override model for this agent (optional) - format: provider/model */
	model?: string;
	/** Override OpenCode agent for this agent (optional) */
	agent?: string;
}

/**
 * Full pipeline configuration loaded from pipeline.yaml
 */
export interface PipelineConfig {
	/** Global settings */
	settings?: Settings;
	/** Agents to run in sequence */
	agents: AgentConfig[];
}

/**
 * Status of a pipeline run
 */
export type RunStatus = "pending" | "in_progress" | "completed" | "failed";

/**
 * State of a single pipeline run, persisted to JSON
 */
export interface RunState {
	/** Linear story ID */
	storyId: string;
	/** Git branch name (e.g., flow/DEV-18) */
	branch: string;
	/** Absolute path to the worktree directory */
	worktreePath: string;
	/** Current status of the run */
	status: RunStatus;
	/** Name of the agent currently running (null if not in_progress) */
	currentAgent: string | null;
	/** Names of agents that have completed successfully */
	completedAgents: string[];
	/** ISO timestamp when the run started */
	startedAt: string;
	/** ISO timestamp when the run was last updated */
	updatedAt: string;
	/** Error message if the run failed */
	error: string | null;
}

/**
 * Result of a single pipeline execution (used for multi-story runs)
 */
export interface PipelineResult {
	/** Linear story ID */
	storyId: string;
	/** Final status of the pipeline */
	status: "completed" | "failed" | "skipped";
	/** Name of agent that failed (if status is 'failed') */
	failedAgent?: string;
	/** Reason for skip (if status is 'skipped') */
	skipReason?: string;
	/** Error message (if status is 'failed') */
	error?: string;
}

/**
 * Template variables available for substitution in agent prompts
 */
export interface TemplateVariables {
	/** Linear story ID passed to the CLI */
	storyId: string;
	/** Git branch name created for this run */
	branch: string;
	/** Absolute path to the worktree directory */
	worktreePath: string;
	/** Name of the current agent being executed */
	agentName: string;
}
