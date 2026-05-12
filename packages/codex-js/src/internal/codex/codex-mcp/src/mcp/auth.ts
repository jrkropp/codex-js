import { CODEX_APPS_MCP_SERVER_NAME } from "./mod";
import type { McpServerTransportConfig } from "../rmcp_client";

export type McpAuthStatus =
	| "unsupported"
	| "notLoggedIn"
	| "bearerToken"
	| "oAuth";

export type OAuthCredentialsStoreMode = unknown;

export type McpServerConfig = {
	enabled?: boolean;
	transport: McpServerTransportConfig;
	scopes?: readonly string[] | null;
	oauth_tokens_present?: boolean | null;
	startup_timeout_sec?: number | null;
};

export type CodexMcpAuthLike = {
	uses_codex_backend?: boolean | (() => boolean | null | undefined) | null;
};

export type McpOAuthLoginConfig = {
	url: string;
	http_headers?: Record<string, string> | null;
	env_http_headers?: Record<string, string> | null;
	discovered_scopes?: string[] | null;
};

export type McpOAuthLoginSupport =
	| { type: "Supported"; config: McpOAuthLoginConfig }
	| { type: "Unsupported" }
	| { type: "Unknown"; error: Error };

export const McpOAuthLoginSupport = {
	Supported(config: McpOAuthLoginConfig): McpOAuthLoginSupport {
		return { type: "Supported", config };
	},
	Unsupported: { type: "Unsupported" } as McpOAuthLoginSupport,
	Unknown(error: unknown): McpOAuthLoginSupport {
		return {
			type: "Unknown",
			error: error instanceof Error ? error : new Error(String(error)),
		};
	},
} as const;

export const McpOAuthScopesSource = {
	Explicit: "Explicit",
	Configured: "Configured",
	Discovered: "Discovered",
	Empty: "Empty",
} as const;

export type McpOAuthScopesSource =
	(typeof McpOAuthScopesSource)[keyof typeof McpOAuthScopesSource];

export type ResolvedMcpOAuthScopes = {
	scopes: string[];
	source: McpOAuthScopesSource;
};

export type McpAuthStatusEntry = {
	config: McpServerConfig;
	auth_status: McpAuthStatus;
};

export class OAuthProviderError extends Error {
	constructor(
		readonly error?: string | null,
		readonly error_description?: string | null,
	) {
		super(error_description ?? error ?? "OAuth provider error");
		this.name = "OAuthProviderError";
	}
}

export async function oauth_login_support(
	transport: McpServerTransportConfig,
): Promise<McpOAuthLoginSupport> {
	if (transport.type !== "streamable_http" || transport.bearer_token_env_var) {
		return McpOAuthLoginSupport.Unsupported;
	}

	try {
		const discovery = await discover_streamable_http_oauth(
			transport.url,
			transport.http_headers,
			transport.env_http_headers,
		);
		return discovery
			? McpOAuthLoginSupport.Supported({
					url: transport.url,
					http_headers: transport.http_headers ?? null,
					env_http_headers: transport.env_http_headers ?? null,
					discovered_scopes: discovery.scopes_supported ?? null,
				})
			: McpOAuthLoginSupport.Unsupported;
	} catch (error) {
		return McpOAuthLoginSupport.Unknown(error);
	}
}

export async function discover_supported_scopes(
	transport: McpServerTransportConfig,
): Promise<string[] | null> {
	const support = await oauth_login_support(transport);
	return support.type === "Supported"
		? (support.config.discovered_scopes ?? null)
		: null;
}

export function resolve_oauth_scopes(
	explicit_scopes?: readonly string[] | null,
	configured_scopes?: readonly string[] | null,
	discovered_scopes?: readonly string[] | null,
): ResolvedMcpOAuthScopes {
	if (explicit_scopes) {
		return {
			scopes: [...explicit_scopes],
			source: McpOAuthScopesSource.Explicit,
		};
	}
	if (configured_scopes) {
		return {
			scopes: [...configured_scopes],
			source: McpOAuthScopesSource.Configured,
		};
	}
	if (discovered_scopes && discovered_scopes.length > 0) {
		return {
			scopes: [...discovered_scopes],
			source: McpOAuthScopesSource.Discovered,
		};
	}
	return {
		scopes: [],
		source: McpOAuthScopesSource.Empty,
	};
}

export function should_retry_without_scopes(
	scopes: ResolvedMcpOAuthScopes,
	error: unknown,
): boolean {
	return (
		scopes.source === McpOAuthScopesSource.Discovered &&
		error instanceof OAuthProviderError
	);
}

export async function compute_auth_statuses(
	servers:
		| ReadonlyMap<string, McpServerConfig>
	| Record<string, McpServerConfig>
	| Iterable<[string, McpServerConfig]>,
	store_mode?: OAuthCredentialsStoreMode,
	auth?: CodexMcpAuthLike | null,
): Promise<Map<string, McpAuthStatusEntry>> {
	const entries = normalize_server_entries(servers);
	const output = new Map<string, McpAuthStatusEntry>();
	await Promise.all(
		entries.map(async ([name, config]) => {
			const hasRuntimeAuth =
				name === CODEX_APPS_MCP_SERVER_NAME &&
				codex_auth_uses_backend(auth) &&
				config.transport.type === "streamable_http" &&
				!config.transport.bearer_token_env_var;
			let authStatus: McpAuthStatus;
			try {
				authStatus = await compute_auth_status(
					name,
					config,
					store_mode,
					hasRuntimeAuth,
				);
			} catch {
				authStatus = "unsupported";
			}
			output.set(name, {
				config,
				auth_status: authStatus,
			});
		}),
	);
	return output;
}

export async function compute_auth_status(
	server_name: string,
	config: McpServerConfig,
	_store_mode?: OAuthCredentialsStoreMode,
	has_runtime_auth = false,
): Promise<McpAuthStatus> {
	if (config.enabled === false) {
		return "unsupported";
	}
	if (has_runtime_auth) {
		return "bearerToken";
	}
	if (config.transport.type === "stdio") {
		return "unsupported";
	}
	if (config.transport.bearer_token_env_var) {
		return "bearerToken";
	}
	if (has_authorization_header(config.transport.http_headers)) {
		return "bearerToken";
	}
	if (
		config.oauth_tokens_present === true ||
		config.transport.oauth_tokens_present === true
	) {
		return "oAuth";
	}

	const support = await oauth_login_support(config.transport);
	if (support.type === "Supported") {
		return "notLoggedIn";
	}
	if (support.type === "Unknown" && server_name.length === 0) {
		return "unsupported";
	}
	return "unsupported";
}

export type StreamableHttpOAuthDiscovery = {
	scopes_supported?: string[] | null;
};

export async function discover_streamable_http_oauth(
	url: string,
	http_headers?: Record<string, string> | null,
	env_http_headers?: Record<string, string> | null,
): Promise<StreamableHttpOAuthDiscovery | null> {
	if (!globalThis.fetch) {
		return null;
	}
	const baseUrl = new URL(url);
	const headers = {
		...http_headers,
		...env_http_headers,
		"MCP-Protocol-Version": "2024-11-05",
	};
	let lastError: unknown = null;
	for (const path of discovery_paths(baseUrl.pathname)) {
		const discoveryUrl = new URL(baseUrl.toString());
		discoveryUrl.pathname = path;
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 5_000);
			const response = await fetch(discoveryUrl, {
				headers,
				signal: controller.signal,
			});
			clearTimeout(timeout);
			if (!response.ok) {
				continue;
			}
			const metadata = (await response.json()) as {
				authorization_endpoint?: unknown;
				token_endpoint?: unknown;
				scopes_supported?: unknown;
			};
			if (
				typeof metadata.authorization_endpoint === "string" &&
				typeof metadata.token_endpoint === "string"
			) {
				return {
					scopes_supported: normalize_scopes(metadata.scopes_supported),
				};
			}
		} catch (error) {
			lastError = error;
		}
	}
	if (lastError instanceof Error && lastError.name !== "AbortError") {
		return null;
	}
	return null;
}

export function discovery_paths(base_path: string): string[] {
	const trimmed = base_path.replace(/^\/+|\/+$/g, "");
	const canonical = "/.well-known/oauth-authorization-server";
	if (!trimmed) {
		return [canonical];
	}
	const candidates = [
		`${canonical}/${trimmed}`,
		`/${trimmed}/.well-known/oauth-authorization-server`,
		canonical,
	];
	return [...new Set(candidates)];
}

function normalize_scopes(value: unknown): string[] | null {
	if (!Array.isArray(value)) {
		return null;
	}
	const normalized: string[] = [];
	for (const item of value) {
		if (typeof item !== "string") {
			continue;
		}
		const scope = item.trim();
		if (scope && !normalized.includes(scope)) {
			normalized.push(scope);
		}
	}
	return normalized.length > 0 ? normalized : null;
}

function normalize_server_entries(
	servers:
		| ReadonlyMap<string, McpServerConfig>
		| Record<string, McpServerConfig>
		| Iterable<[string, McpServerConfig]>,
): Array<[string, McpServerConfig]> {
	if (servers instanceof Map) {
		return [...servers.entries()];
	}
	if (typeof (servers as Iterable<[string, McpServerConfig]>)[Symbol.iterator] === "function") {
		return [...(servers as Iterable<[string, McpServerConfig]>)];
	}
	return Object.entries(servers as Record<string, McpServerConfig>);
}

function codex_auth_uses_backend(auth?: CodexMcpAuthLike | null): boolean {
	const value = auth?.uses_codex_backend;
	return Boolean(typeof value === "function" ? value() : value);
}

function has_authorization_header(
	headers?: Record<string, string> | null,
): boolean {
	return Object.keys(headers ?? {}).some(
		(header) => header.toLowerCase() === "authorization",
	);
}
