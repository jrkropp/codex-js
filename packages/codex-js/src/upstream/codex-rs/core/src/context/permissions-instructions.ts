import type { TurnContext } from "../session/turn-context";
import { ContextualUserFragment } from "./fragment";

const APPROVAL_POLICY_NEVER =
	"Approval policy is currently never. Do not provide the `sandbox_permissions` for any reason, commands will be rejected.";
const APPROVAL_POLICY_UNLESS_TRUSTED =
	'Approvals are your mechanism to get user consent to run shell commands without the sandbox. `approval_policy` is `unless-trusted`: The harness will escalate most commands for user approval, apart from a limited allowlist of safe "read" commands.';
const APPROVAL_POLICY_ON_FAILURE =
	"Approvals are your mechanism to get user consent to run shell commands without the sandbox. `approval_policy` is `on-failure`: The harness will allow all commands to run in the sandbox (if enabled), and failures will be escalated to the user for approval to run again without the sandbox.";
const APPROVAL_POLICY_ON_REQUEST = `# Escalation Requests

Commands are run outside the sandbox if they are approved by the user, or match an existing rule that allows it to run unrestricted.

## How to request escalation

IMPORTANT: To request approval to execute a command that will require escalated privileges:

- Provide the \`sandbox_permissions\` parameter with the value \`"require_escalated"\`
- Include a short question asking the user if they want to allow the action in \`justification\` parameter.
- Optionally suggest a \`prefix_rule\` - this will be shown to the user with an option to persist the rule approval for future sessions.`;
const REQUEST_PERMISSIONS_TOOL_PROMPT =
	"# request_permissions Tool\n\nThe built-in `request_permissions` tool is available in this session. Invoke it when you need to request additional `network` or `file_system` permissions before later shell-like commands need them. Request only the specific permissions required for the task.";
const AUTO_REVIEW_APPROVAL_SUFFIX =
	"`approvals_reviewer` is `auto_review`: Sandbox escalations with require_escalated will be reviewed for compliance with the policy. If a rejection happens, you should proceed only with a materially safer alternative, or inform the user of the risk and send a final message to ask for approval.";

export class PermissionsInstructions extends ContextualUserFragment {
	constructor(text: string) {
		super({
			role: "developer",
			start_marker: "<permissions instructions>",
			end_marker: "</permissions instructions>",
			body: () => text,
		});
	}

	static fromTurnContext(
		turnContext: TurnContext,
		options: { request_permissions_tool_enabled?: boolean } = {},
	): PermissionsInstructions {
		const sandboxText = sandboxInstructionText(
			sandboxModeFromTurnContext(turnContext),
			networkAccessFromTurnContext(turnContext),
		);
		const approvalText = approvalInstructionText(
			turnContext.approval_policy,
			turnContext.approvals_reviewer,
			options.request_permissions_tool_enabled ?? true,
		);
		const text = [sandboxText, approvalText]
			.filter((section) => section.length > 0)
			.join("\n\n");
		return new PermissionsInstructions(text.endsWith("\n") ? text : `${text}\n`);
	}
}

function sandboxModeFromTurnContext(
	turnContext: TurnContext,
): "danger-full-access" | "workspace-write" | "read-only" {
	const permissionProfile = turnContext.effectivePermissionProfile();
	const sandboxMode = stringField(turnContext.effectiveSandboxPolicy(), [
		"mode",
		"type",
	]);
	const permissionProfileMode = stringField(permissionProfile, [
		"profile",
		"mode",
		"type",
	]);
	const mode = sandboxMode ?? permissionProfileMode;

	if (
		mode === "danger-full-access" ||
		mode === "danger_full_access" ||
		mode === "disabled"
	) {
		return "danger-full-access";
	}
	if (mode === "read-only" || mode === "read_only" || mode === "readonly") {
		return "read-only";
	}
	return "workspace-write";
}

function networkAccessFromTurnContext(turnContext: TurnContext): string {
	const network = recordField(turnContext.effectivePermissionProfile(), "network");
	const networkAccess =
		stringField(network, ["access", "mode", "policy"]) ??
		stringField(turnContext.effectiveSandboxPolicy(), ["network_access"]);
	if (networkAccess === "restricted" || networkAccess === "disabled") {
		return "restricted";
	}
	return "enabled";
}

function sandboxInstructionText(
	mode: "danger-full-access" | "workspace-write" | "read-only",
	networkAccess: string,
): string {
	switch (mode) {
		case "danger-full-access":
			return `Filesystem sandboxing defines which files can be read or written. \`sandbox_mode\` is \`danger-full-access\`: No filesystem sandboxing - all commands are permitted. Network access is ${networkAccess}.`;
		case "read-only":
			return `Filesystem sandboxing defines which files can be read or written. \`sandbox_mode\` is \`read-only\`: The sandbox only permits reading files. Network access is ${networkAccess}.`;
		case "workspace-write":
			return `Filesystem sandboxing defines which files can be read or written. \`sandbox_mode\` is \`workspace-write\`: The sandbox permits reading files, and editing files in \`cwd\` and \`writable_roots\`. Editing files in other directories requires approval. Network access is ${networkAccess}.`;
	}
}

function approvalInstructionText(
	approvalPolicy: string,
	approvalsReviewer: string | null | undefined,
	requestPermissionsToolEnabled: boolean,
): string {
	const normalizedPolicy = approvalPolicy.replaceAll("_", "-");
	let text: string;
	switch (normalizedPolicy) {
		case "never":
			text = APPROVAL_POLICY_NEVER;
			break;
		case "unless-trusted":
			text = APPROVAL_POLICY_UNLESS_TRUSTED;
			break;
		case "on-failure":
			text = APPROVAL_POLICY_ON_FAILURE;
			break;
		case "on-request":
			text = APPROVAL_POLICY_ON_REQUEST;
			break;
		default:
			text = `Approval policy is currently ${approvalPolicy}.`;
			break;
	}

	if (requestPermissionsToolEnabled && normalizedPolicy !== "never") {
		text = `${text}\n\n${REQUEST_PERMISSIONS_TOOL_PROMPT}`;
	}

	if (approvalsReviewer === "auto_review" && normalizedPolicy !== "never") {
		text = `${text}\n\n${AUTO_REVIEW_APPROVAL_SUFFIX}`;
	}

	return text;
}

function stringField(
	record: Record<string, unknown> | null | undefined,
	keys: string[],
): string | null {
	for (const key of keys) {
		const value = record?.[key];
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}
	return null;
}

function recordField(
	record: Record<string, unknown> | null | undefined,
	key: string,
): Record<string, unknown> | null {
	const value = record?.[key];
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}
