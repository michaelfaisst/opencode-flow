import { parse } from "yaml";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { AgentConfig, PipelineConfig } from "../types.js";

/** Name of the configuration directory */
const CONFIG_DIR_NAME = ".opencode-flow";

/** Name of the pipeline configuration file */
const CONFIG_FILE_NAME = "pipeline.yaml";

/**
 * Error thrown when configuration is invalid or missing
 */
export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

/**
 * Find the .opencode-flow directory by walking up from the current working directory.
 * @returns Absolute path to the .opencode-flow directory
 * @throws ConfigError if the directory is not found
 */
export function findConfigDir(startDir: string = process.cwd()): string {
	let currentDir = resolve(startDir);

	// Walk up the directory tree until we find .opencode-flow or reach the root
	while (true) {
		const configPath = join(currentDir, CONFIG_DIR_NAME);
		if (existsSync(configPath)) {
			return configPath;
		}

		const parentDir = dirname(currentDir);
		// Stop if we've reached the filesystem root
		if (parentDir === currentDir) {
			break;
		}
		currentDir = parentDir;
	}

	throw new ConfigError(
		`Could not find ${CONFIG_DIR_NAME} directory. Run 'ocf init' to initialize.`,
	);
}

/**
 * Validate a single agent configuration
 */
function validateAgent(agent: unknown, index: number, configDir: string): AgentConfig {
	if (typeof agent !== "object" || agent === null) {
		throw new ConfigError(`agents[${index}] must be an object`);
	}

	const agentObj = agent as Record<string, unknown>;

	// Validate name
	if (typeof agentObj.name !== "string" || agentObj.name.trim() === "") {
		throw new ConfigError(`agents[${index}].name must be a non-empty string`);
	}

	// Validate promptPath
	if (typeof agentObj.promptPath !== "string" || agentObj.promptPath.trim() === "") {
		throw new ConfigError(`agents[${index}].promptPath must be a non-empty string`);
	}

	const name = agentObj.name.trim();
	const promptPath = agentObj.promptPath.trim();

	// Check prompt file exists
	const resolvedPromptPath = resolve(configDir, promptPath);
	if (!existsSync(resolvedPromptPath)) {
		throw new ConfigError(
			`agents[${index}].promptPath file not found: ${promptPath} (resolved to ${resolvedPromptPath})`,
		);
	}

	// Validate optional model format
	if (agentObj.model !== undefined) {
		if (typeof agentObj.model !== "string") {
			throw new ConfigError(`agents[${index}].model must be a string`);
		}
		if (!agentObj.model.includes("/")) {
			throw new ConfigError(
				`agents[${index}].model must be in format 'provider/model', got: ${agentObj.model}`,
			);
		}
	}

	// Validate optional agent
	if (agentObj.agent !== undefined && typeof agentObj.agent !== "string") {
		throw new ConfigError(`agents[${index}].agent must be a string`);
	}

	return {
		name,
		promptPath,
		model: typeof agentObj.model === "string" ? agentObj.model.trim() : undefined,
		agent: typeof agentObj.agent === "string" ? agentObj.agent.trim() : undefined,
	};
}

/**
 * Validate the full pipeline configuration
 */
export function validateConfig(config: unknown, configDir: string): PipelineConfig {
	if (typeof config !== "object" || config === null) {
		throw new ConfigError("Configuration must be an object");
	}

	const configObj = config as Record<string, unknown>;

	// Validate agents array
	if (!Array.isArray(configObj.agents)) {
		throw new ConfigError("'agents' must be an array");
	}

	if (configObj.agents.length === 0) {
		throw new ConfigError("'agents' array must have at least one agent");
	}

	// Validate each agent
	const agents: AgentConfig[] = configObj.agents.map((agent, index) =>
		validateAgent(agent, index, configDir),
	);

	// Check for duplicate agent names
	const names = new Set<string>();
	for (const agent of agents) {
		if (names.has(agent.name)) {
			throw new ConfigError(`Duplicate agent name: ${agent.name}`);
		}
		names.add(agent.name);
	}

	// Validate optional settings
	const result: PipelineConfig = { agents };

	if (configObj.settings !== undefined) {
		if (typeof configObj.settings !== "object" || configObj.settings === null) {
			throw new ConfigError("'settings' must be an object");
		}

		const settings = configObj.settings as Record<string, unknown>;

		result.settings = {};

		if (settings.defaultModel !== undefined) {
			if (typeof settings.defaultModel !== "string") {
				throw new ConfigError("settings.defaultModel must be a string");
			}
			if (!settings.defaultModel.includes("/")) {
				throw new ConfigError(
					`settings.defaultModel must be in format 'provider/model', got: ${settings.defaultModel}`,
				);
			}
			result.settings.defaultModel = settings.defaultModel.trim();
		}

		if (settings.defaultAgent !== undefined) {
			if (typeof settings.defaultAgent !== "string") {
				throw new ConfigError("settings.defaultAgent must be a string");
			}
			result.settings.defaultAgent = settings.defaultAgent.trim();
		}
	}

	return result;
}

/**
 * Load and validate the pipeline configuration from .opencode-flow/pipeline.yaml
 * @param startDir - Directory to start searching from (defaults to cwd)
 * @returns The validated pipeline configuration and the config directory path
 * @throws ConfigError if the configuration is invalid or missing
 */
export async function loadConfig(
	startDir?: string,
): Promise<{ config: PipelineConfig; configDir: string }> {
	const configDir = findConfigDir(startDir);
	const configPath = join(configDir, CONFIG_FILE_NAME);

	if (!existsSync(configPath)) {
		throw new ConfigError(`Configuration file not found: ${configPath}`);
	}

	let content: string;

	try {
		content = await readFile(configPath, "utf-8");
	} catch (error) {
		throw new ConfigError(
			`Failed to read configuration file: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	let parsed: unknown;
	try {
		parsed = parse(content);
	} catch (error) {
		throw new ConfigError(
			`Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const config = validateConfig(parsed, configDir);

	return { config, configDir };
}
