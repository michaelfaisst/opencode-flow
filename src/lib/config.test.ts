import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { findConfigDir, validateConfig, loadConfig, ConfigError } from "./config.js";

/**
 * Helper to create a temporary test directory structure
 */
function createTestDir(): string {
	const testDir = join(tmpdir(), `ocf-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(testDir, { recursive: true });
	// Use realpath to resolve symlinks (e.g., /var -> /private/var on macOS)
	return realpathSync(testDir);
}

/**
 * Helper to clean up test directory
 */
function cleanupTestDir(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

describe("findConfigDir", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("finds .opencode-flow in the current directory", () => {
		const configDir = join(testDir, ".opencode-flow");
		mkdirSync(configDir);

		const result = findConfigDir(testDir);
		expect(result).toBe(configDir);
	});

	it("finds .opencode-flow in a parent directory", () => {
		const configDir = join(testDir, ".opencode-flow");
		mkdirSync(configDir);

		const nestedDir = join(testDir, "src", "lib");
		mkdirSync(nestedDir, { recursive: true });

		const result = findConfigDir(nestedDir);
		expect(result).toBe(configDir);
	});

	it("throws ConfigError when .opencode-flow is not found", () => {
		expect(() => findConfigDir(testDir)).toThrow(ConfigError);
		expect(() => findConfigDir(testDir)).toThrow("Could not find .opencode-flow directory");
	});
});

describe("validateConfig", () => {
	let testDir: string;
	let configDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		configDir = join(testDir, ".opencode-flow");
		mkdirSync(configDir);
		// Create a dummy prompt file for validation
		mkdirSync(join(configDir, "agents"));
		writeFileSync(join(configDir, "agents", "build.md"), "# Build Agent");
		writeFileSync(join(configDir, "agents", "test.md"), "# Test Agent");
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("validates a minimal valid config", () => {
		const config = {
			agents: [{ name: "build", promptPath: "./agents/build.md" }],
		};

		const result = validateConfig(config, configDir);

		const agent = result.agents[0];

		expect(result.agents).toHaveLength(1);
		expect(agent).toBeDefined();
		expect(agent?.name).toBe("build");
		expect(agent?.promptPath).toBe("./agents/build.md");
	});

	it("validates a full config with settings", () => {
		const config = {
			settings: {
				defaultModel: "anthropic/claude-sonnet-4-20250514",
				defaultAgent: "code",
			},
			agents: [
				{
					name: "build",
					promptPath: "./agents/build.md",
					model: "openai/gpt-4",
					agent: "plan",
				},
				{
					name: "test",
					promptPath: "./agents/test.md",
				},
			],
		};

		const result = validateConfig(config, configDir);
		const firstAgent = result.agents[0];

		expect(result.settings?.defaultModel).toBe("anthropic/claude-sonnet-4-20250514");
		expect(result.settings?.defaultAgent).toBe("code");

		expect(result.agents).toHaveLength(2);
		expect(firstAgent).toBeDefined();
		expect(firstAgent?.model).toBe("openai/gpt-4");
		expect(firstAgent?.agent).toBe("plan");
	});

	it("throws when config is not an object", () => {
		expect(() => validateConfig(null, configDir)).toThrow("Configuration must be an object");
		expect(() => validateConfig("string", configDir)).toThrow(
			"Configuration must be an object",
		);
	});

	it("throws when agents is not an array", () => {
		expect(() => validateConfig({ agents: "not-array" }, configDir)).toThrow(
			"'agents' must be an array",
		);
	});

	it("throws when agents array is empty", () => {
		expect(() => validateConfig({ agents: [] }, configDir)).toThrow(
			"'agents' array must have at least one agent",
		);
	});

	it("throws when agent is missing name", () => {
		const config = { agents: [{ promptPath: "./agents/build.md" }] };
		expect(() => validateConfig(config, configDir)).toThrow(
			"agents[0].name must be a non-empty string",
		);
	});

	it("throws when agent is missing promptPath", () => {
		const config = { agents: [{ name: "build" }] };
		expect(() => validateConfig(config, configDir)).toThrow(
			"agents[0].promptPath must be a non-empty string",
		);
	});

	it("throws when prompt file does not exist", () => {
		const config = { agents: [{ name: "build", promptPath: "./agents/nonexistent.md" }] };
		expect(() => validateConfig(config, configDir)).toThrow(
			"agents[0].promptPath file not found",
		);
	});

	it("throws when model format is invalid", () => {
		const config = {
			agents: [{ name: "build", promptPath: "./agents/build.md", model: "invalid-model" }],
		};
		expect(() => validateConfig(config, configDir)).toThrow(
			"agents[0].model must be in format 'provider/model'",
		);
	});

	it("throws when agent names are duplicated", () => {
		const config = {
			agents: [
				{ name: "build", promptPath: "./agents/build.md" },
				{ name: "build", promptPath: "./agents/test.md" },
			],
		};
		expect(() => validateConfig(config, configDir)).toThrow("Duplicate agent name: build");
	});

	it("throws when settings.defaultModel format is invalid", () => {
		const config = {
			settings: { defaultModel: "invalid" },
			agents: [{ name: "build", promptPath: "./agents/build.md" }],
		};
		expect(() => validateConfig(config, configDir)).toThrow(
			"settings.defaultModel must be in format 'provider/model'",
		);
	});

	it("trims whitespace from names and promptPaths", () => {
		const config = {
			agents: [{ name: "  build  ", promptPath: "  ./agents/build.md  " }],
		};

		const result = validateConfig(config, configDir);

		const agent = result.agents[0];
		expect(agent).toBeDefined();
		expect(agent?.name).toBe("build");
		expect(agent?.promptPath).toBe("./agents/build.md");
	});
});

describe("loadConfig", () => {
	let testDir: string;
	let configDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		configDir = join(testDir, ".opencode-flow");
		mkdirSync(configDir);
		mkdirSync(join(configDir, "agents"));
		writeFileSync(join(configDir, "agents", "build.md"), "# Build Agent");
	});

	afterEach(() => {
		cleanupTestDir(testDir);
	});

	it("loads and parses a valid pipeline.yaml", async () => {
		const yamlContent = `
settings:
  defaultModel: anthropic/claude-sonnet-4-20250514

agents:
  - name: build
    promptPath: ./agents/build.md
`;
		writeFileSync(join(configDir, "pipeline.yaml"), yamlContent);

		const { config, configDir: returnedConfigDir } = await loadConfig(testDir);

		const agent = config.agents[0];

		expect(returnedConfigDir).toBe(configDir);
		expect(config.settings?.defaultModel).toBe("anthropic/claude-sonnet-4-20250514");
		expect(config.agents).toHaveLength(1);
		expect(agent).toBeDefined();
		expect(agent?.name).toBe("build");
	});

	it("throws when pipeline.yaml does not exist", async () => {
		await expect(loadConfig(testDir)).rejects.toThrow("Configuration file not found");
	});

	it("throws when pipeline.yaml contains invalid YAML", async () => {
		writeFileSync(join(configDir, "pipeline.yaml"), "invalid: yaml: content: [");

		await expect(loadConfig(testDir)).rejects.toThrow("Failed to parse YAML");
	});

	it("throws when pipeline.yaml has invalid config structure", async () => {
		writeFileSync(join(configDir, "pipeline.yaml"), "agents: not-an-array");

		await expect(loadConfig(testDir)).rejects.toThrow("'agents' must be an array");
	});
});
