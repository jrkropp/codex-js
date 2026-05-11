export const MCP_TOOL_CODEX_APPS_META_KEY = "_codex_apps";
export const CONNECTOR_AUTH_FAILURE_META_KEY = "connector_auth_failure";
export const CONNECTOR_AUTH_FAILURE_IS_AUTH_FAILURE_KEY = "is_auth_failure";
export const CONNECTOR_AUTH_FAILURE_AUTH_REASON_KEY = "auth_reason";
export const CONNECTOR_AUTH_FAILURE_CONNECTOR_ID_KEY = "connector_id";
export const CONNECTOR_AUTH_FAILURE_LINK_ID_KEY = "link_id";
export const CONNECTOR_AUTH_FAILURE_ERROR_CODE_KEY = "error_code";
export const CONNECTOR_AUTH_FAILURE_ERROR_HTTP_STATUS_CODE_KEY =
	"error_http_status_code";
export const CONNECTOR_AUTH_FAILURE_ERROR_ACTION_KEY = "error_action";

export type CallToolResult = {
	content?: unknown[];
	structured_content?: unknown;
	is_error?: boolean | null;
	meta?: unknown;
};

export type CodexAppsConnectorAuthFailure = {
	connector_id: string;
	connector_name: string;
	install_url: string;
	auth_reason?: string | null;
	link_id?: string | null;
	error_code?: string | null;
	error_http_status_code?: number | null;
	error_action?: string | null;
};

export type CodexAppsAuthElicitation = {
	meta: unknown;
	message: string;
	url: string;
	elicitation_id: string;
};

export type CodexAppsAuthElicitationPlan = {
	auth_failure: CodexAppsConnectorAuthFailure;
	elicitation: CodexAppsAuthElicitation;
};

export function connector_auth_failure_from_tool_result(
	result: CallToolResult,
	connector_id?: string | null,
	connector_name?: string | null,
	install_url?: string | null,
): CodexAppsConnectorAuthFailure | null {
	if (result.is_error !== true) {
		return null;
	}
	const authFailure = as_record(
		as_record(as_record(result.meta)?.[MCP_TOOL_CODEX_APPS_META_KEY])?.[
			CONNECTOR_AUTH_FAILURE_META_KEY
		],
	);
	if (
		authFailure?.[CONNECTOR_AUTH_FAILURE_IS_AUTH_FAILURE_KEY] !== true
	) {
		return null;
	}
	const trustedConnectorId = normalize_string(connector_id);
	if (!trustedConnectorId) {
		return null;
	}
	const authFailureConnectorId = string_auth_failure_field(
		authFailure,
		CONNECTOR_AUTH_FAILURE_CONNECTOR_ID_KEY,
	);
	if (
		authFailureConnectorId &&
		authFailureConnectorId !== trustedConnectorId
	) {
		return null;
	}
	const resolvedInstallUrl = normalize_string(install_url);
	if (!resolvedInstallUrl) {
		return null;
	}
	return {
		connector_id: trustedConnectorId,
		connector_name: normalize_string(connector_name) ?? trustedConnectorId,
		install_url: resolvedInstallUrl,
		auth_reason: string_auth_failure_field(
			authFailure,
			CONNECTOR_AUTH_FAILURE_AUTH_REASON_KEY,
		),
		link_id: string_auth_failure_field(
			authFailure,
			CONNECTOR_AUTH_FAILURE_LINK_ID_KEY,
		),
		error_code: string_auth_failure_field(
			authFailure,
			CONNECTOR_AUTH_FAILURE_ERROR_CODE_KEY,
		),
		error_http_status_code:
			typeof authFailure[
				CONNECTOR_AUTH_FAILURE_ERROR_HTTP_STATUS_CODE_KEY
			] === "number"
				? (authFailure[
						CONNECTOR_AUTH_FAILURE_ERROR_HTTP_STATUS_CODE_KEY
					] as number)
				: null,
		error_action: string_auth_failure_field(
			authFailure,
			CONNECTOR_AUTH_FAILURE_ERROR_ACTION_KEY,
		),
	};
}

export function build_auth_elicitation_plan(
	call_id: string,
	result: CallToolResult,
	connector_id?: string | null,
	connector_name?: string | null,
	install_url?: string | null,
): CodexAppsAuthElicitationPlan | null {
	const authFailure = connector_auth_failure_from_tool_result(
		result,
		connector_id,
		connector_name,
		install_url,
	);
	if (!authFailure) {
		return null;
	}
	return {
		auth_failure: authFailure,
		elicitation: build_auth_elicitation(call_id, authFailure),
	};
}

export function build_auth_elicitation(
	call_id: string,
	auth_failure: CodexAppsConnectorAuthFailure,
): CodexAppsAuthElicitation {
	return {
		meta: {
			[MCP_TOOL_CODEX_APPS_META_KEY]: {
				[CONNECTOR_AUTH_FAILURE_META_KEY]: omit_undefined({
					[CONNECTOR_AUTH_FAILURE_IS_AUTH_FAILURE_KEY]: true,
					[CONNECTOR_AUTH_FAILURE_CONNECTOR_ID_KEY]:
						auth_failure.connector_id,
					connector_name: auth_failure.connector_name,
					install_url: auth_failure.install_url,
					[CONNECTOR_AUTH_FAILURE_AUTH_REASON_KEY]:
						auth_failure.auth_reason ?? undefined,
					[CONNECTOR_AUTH_FAILURE_LINK_ID_KEY]:
						auth_failure.link_id ?? undefined,
					[CONNECTOR_AUTH_FAILURE_ERROR_CODE_KEY]:
						auth_failure.error_code ?? undefined,
					[CONNECTOR_AUTH_FAILURE_ERROR_HTTP_STATUS_CODE_KEY]:
						auth_failure.error_http_status_code ?? undefined,
					[CONNECTOR_AUTH_FAILURE_ERROR_ACTION_KEY]:
						auth_failure.error_action ?? undefined,
				}),
			},
		},
		message: auth_elicitation_message(auth_failure),
		url: auth_failure.install_url,
		elicitation_id: auth_elicitation_id(call_id),
	};
}

export function auth_elicitation_completed_result(
	auth_failure: CodexAppsConnectorAuthFailure,
	meta?: unknown,
): CallToolResult {
	return {
		content: [
			{
				type: "text",
				text: `Authentication for ${auth_failure.connector_name} was requested and accepted. Retry this tool call now.`,
			},
		],
		structured_content: null,
		is_error: true,
		meta,
	};
}

export function auth_elicitation_id(call_id: string): string {
	return `codex_apps_auth_${call_id}`;
}

export function auth_elicitation_message(
	auth_failure: CodexAppsConnectorAuthFailure,
): string {
	switch (auth_failure.auth_reason) {
		case "oauth_upgrade_required":
			return `Reconnect ${auth_failure.connector_name} on ChatGPT to grant the permissions needed for this request.`;
		case "reauthentication_required":
			return `Reconnect ${auth_failure.connector_name} on ChatGPT to restore access for this request.`;
		case "missing_link":
			return `Sign in to ${auth_failure.connector_name} on ChatGPT to use it in Codex.`;
		default:
			return `Sign in to ${auth_failure.connector_name} on ChatGPT to continue.`;
	}
}

function string_auth_failure_field(
	auth_failure: Record<string, unknown>,
	key: string,
): string | null {
	return normalize_string(auth_failure[key]);
}

function normalize_string(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function as_record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function omit_undefined(
	input: Record<string, unknown | undefined>,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined),
	);
}
