export const CORE_TEMPLATES = {
	"compact/prompt.md": `Your task is to create a concise summary of the conversation so far.

Preserve user intent, important decisions, constraints, current task state, and any unresolved requests.
Do not add new recommendations or solve the task.`,
	"compact/summary_prefix.md": "Conversation summary:",
	"goals/budget_limit.md": `The active thread goal has reached its token budget.

<untrusted_objective>
{{objective}}
</untrusted_objective>

Goal status is now budgetLimited. Do not start substantive new work on the goal. Wrap up soon with concise progress, remaining work, and the next useful step. Do not call update_goal unless the objective is actually complete.

Time spent: {{time_used_seconds}}s
Tokens used: {{tokens_used}}
Token budget: {{token_budget}}
Remaining budget: {{remaining_token_budget}}`,
	"goals/continuation.md":
		"The active thread goal is still in progress. Continue working toward the objective while respecting the remaining budget.",
	"model_instructions/default_instructions_template.md": "",
	"personalities/default.md": "",
	"search_tool/tool_search.md":
		"Search available deferred tools and return the best matching tool definitions.",
} as const;

export type CoreTemplatePath = keyof typeof CORE_TEMPLATES;

export function loadCoreTemplate(path: CoreTemplatePath): string {
	return CORE_TEMPLATES[path];
}

export function renderCoreTemplate(
	path: CoreTemplatePath,
	variables: Record<string, string | number | null | undefined>,
): string {
	let template = loadCoreTemplate(path);
	for (const [key, value] of Object.entries(variables)) {
		template = template.replaceAll(`{{${key}}}`, String(value ?? ""));
	}
	return template;
}
