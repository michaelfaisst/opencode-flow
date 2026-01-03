import { describe, it, expect } from "vitest";

import { substituteVariables } from "./template.js";
import type { TemplateVariables } from "../types.js";

/**
 * Helper to create a full set of template variables for testing
 */
function createTestVariables(overrides?: Partial<TemplateVariables>): TemplateVariables {
	return {
		storyId: "DEV-18",
		branch: "flow/DEV-18",
		worktreePath: "/path/to/repo/DEV-18",
		agentName: "build",
		...overrides,
	};
}

describe("substituteVariables", () => {
	it("substitutes a single variable", () => {
		const template = "Implementing {{storyId}}";
		const variables = createTestVariables();

		const { result, missingVariables } = substituteVariables(template, variables);

		expect(result).toBe("Implementing DEV-18");
		expect(missingVariables).toHaveLength(0);
	});

	it("substitutes multiple different variables", () => {
		const template = "Story {{storyId}} on branch {{branch}} for agent {{agentName}}";
		const variables = createTestVariables();

		const { result, missingVariables } = substituteVariables(template, variables);

		expect(result).toBe("Story DEV-18 on branch flow/DEV-18 for agent build");
		expect(missingVariables).toHaveLength(0);
	});

	it("substitutes the same variable multiple times", () => {
		const template = "{{storyId}} - Implementing {{storyId}} for {{storyId}}";
		const variables = createTestVariables();

		const { result, missingVariables } = substituteVariables(template, variables);

		expect(result).toBe("DEV-18 - Implementing DEV-18 for DEV-18");
		expect(missingVariables).toHaveLength(0);
	});

	it("substitutes all template variables", () => {
		const template = `
# {{agentName}} Agent

Working on {{storyId}}
Branch: {{branch}}
Path: {{worktreePath}}
`;
		const variables = createTestVariables();

		const { result, missingVariables } = substituteVariables(template, variables);

		expect(result).toContain("# build Agent");
		expect(result).toContain("Working on DEV-18");
		expect(result).toContain("Branch: flow/DEV-18");
		expect(result).toContain("Path: /path/to/repo/DEV-18");
		expect(missingVariables).toHaveLength(0);
	});

	it("leaves missing variables as-is and reports them", () => {
		const template = "{{storyId}} with {{unknownVar}}";
		const variables = createTestVariables();

		const { result, missingVariables } = substituteVariables(template, variables);

		expect(result).toBe("DEV-18 with {{unknownVar}}");
		expect(missingVariables).toEqual(["unknownVar"]);
	});

	it("reports each missing variable only once", () => {
		const template = "{{unknownVar}} and {{unknownVar}} and {{anotherMissing}}";
		const variables = createTestVariables();

		const { result, missingVariables } = substituteVariables(template, variables);

		expect(result).toBe("{{unknownVar}} and {{unknownVar}} and {{anotherMissing}}");
		expect(missingVariables).toEqual(["unknownVar", "anotherMissing"]);
	});

	it("handles template with no variables", () => {
		const template = "No variables here, just plain text.";
		const variables = createTestVariables();

		const { result, missingVariables } = substituteVariables(template, variables);

		expect(result).toBe("No variables here, just plain text.");
		expect(missingVariables).toHaveLength(0);
	});

	it("handles empty template", () => {
		const template = "";
		const variables = createTestVariables();

		const { result, missingVariables } = substituteVariables(template, variables);

		expect(result).toBe("");
		expect(missingVariables).toHaveLength(0);
	});

	it("handles variables with special characters in values", () => {
		const template = "Path: {{worktreePath}}";
		const variables = createTestVariables({
			worktreePath: "/path/with spaces/and-dashes/DEV-18",
		});

		const { result, missingVariables } = substituteVariables(template, variables);

		expect(result).toBe("Path: /path/with spaces/and-dashes/DEV-18");
		expect(missingVariables).toHaveLength(0);
	});

	it("does not substitute variables with spaces in name", () => {
		const template = "{{story Id}} and {{storyId}}";
		const variables = createTestVariables();

		const { result, missingVariables } = substituteVariables(template, variables);

		// {{story Id}} should be left as-is (not a valid variable pattern)
		expect(result).toBe("{{story Id}} and DEV-18");
		expect(missingVariables).toHaveLength(0);
	});

	it("does not substitute malformed variable syntax", () => {
		const template = "{storyId} and {{storyId and {{ storyId}} and {{storyId}}";
		const variables = createTestVariables();

		const { result, missingVariables } = substituteVariables(template, variables);

		expect(result).toBe("{storyId} and {{storyId and {{ storyId}} and DEV-18");
		expect(missingVariables).toHaveLength(0);
	});

	it("handles multiline templates", () => {
		const template = `# Build Agent

You are implementing **{{storyId}}**.

## Context

- Branch: \`{{branch}}\`
- Working directory: \`{{worktreePath}}\`
- Agent: \`{{agentName}}\`

## Instructions

1. Fetch story details for {{storyId}}
2. Implement the feature
`;
		const variables = createTestVariables();

		const { result, missingVariables } = substituteVariables(template, variables);

		expect(result).toContain("implementing **DEV-18**");
		expect(result).toContain("Branch: `flow/DEV-18`");
		expect(result).toContain("Working directory: `/path/to/repo/DEV-18`");
		expect(result).toContain("Agent: `build`");
		expect(result).toContain("Fetch story details for DEV-18");
		expect(missingVariables).toHaveLength(0);
	});
});
