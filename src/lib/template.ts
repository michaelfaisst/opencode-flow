import type { TemplateVariables } from "../types.js";

/**
 * Regex pattern for matching template variables in the format {{variableName}}
 */
const TEMPLATE_VAR_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Result of template substitution including any warnings
 */
export interface SubstitutionResult {
	/** The processed template with variables substituted */
	result: string;
	/** Variables that were found in the template but not provided */
	missingVariables: string[];
}

/**
 * Substitute template variables in a string.
 * Variables use the {{variableName}} syntax.
 *
 * @param template - The template string containing {{variable}} placeholders
 * @param variables - The variables to substitute
 * @returns SubstitutionResult with the processed string and any missing variables
 *
 * @example
 * ```ts
 * const { result, missingVariables } = substituteVariables(
 *   "Implementing {{storyId}} on branch {{branch}}",
 *   { storyId: "DEV-18", branch: "flow/DEV-18", worktreePath: "/path", agentName: "build" }
 * );
 * // result === "Implementing DEV-18 on branch flow/DEV-18"
 * // missingVariables === []
 * ```
 */
export function substituteVariables(
	template: string,
	variables: TemplateVariables,
): SubstitutionResult {
	const missingVariables: string[] = [];
	const variableMap = new Map<string, string>(Object.entries(variables));

	const result = template.replace(TEMPLATE_VAR_PATTERN, (match, varName: string) => {
		const value = variableMap.get(varName);

		if (value === undefined) {
			// Track missing variable but don't fail - leave placeholder as-is
			if (!missingVariables.includes(varName)) {
				missingVariables.push(varName);
			}
			return match;
		}

		return value;
	});

	return { result, missingVariables };
}
