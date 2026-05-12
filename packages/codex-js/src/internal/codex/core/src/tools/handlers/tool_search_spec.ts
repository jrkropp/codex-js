import type { ToolSearchSourceInfo } from "../tool_search_entry";

export function create_tool_search_tool(
	sources: readonly ToolSearchSourceInfo[],
	defaultLimit: number,
) {
	const sourceDescriptionsByName = new Map<string, string | null>();
	for (const source of sources) {
		const existing = sourceDescriptionsByName.get(source.name);
		if (existing === undefined) {
			sourceDescriptionsByName.set(source.name, source.description ?? null);
		} else if (existing === null && source.description) {
			sourceDescriptionsByName.set(source.name, source.description);
		}
	}
	const sourceDescriptions =
		sourceDescriptionsByName.size === 0
			? "None currently enabled."
			: [...sourceDescriptionsByName.entries()]
					.sort(([left], [right]) => left.localeCompare(right))
					.map((source) =>
						source[1]
							? `- ${source[0]}: ${source[1]}`
							: `- ${source[0]}`,
					)
					.join("\n");
	return {
		type: "tool_search" as const,
		execution: "client",
		description: `# Tool discovery\n\nSearches over deferred tool metadata with BM25 and exposes matching tools for the next model call.\n\nYou have access to tools from the following sources:\n${sourceDescriptions}\nSome of the tools may not have been provided to you upfront, and you should use this tool (\`tool_search\`) to search for the required tools. For MCP tool discovery, always use \`tool_search\` instead of \`list_mcp_resources\` or \`list_mcp_resource_templates\`.`,
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Search query for deferred tools.",
				},
				limit: {
					type: "number",
					description: `Maximum number of tools to return (defaults to ${defaultLimit}).`,
				},
			},
			required: ["query"],
			additionalProperties: false,
		},
	};
}
