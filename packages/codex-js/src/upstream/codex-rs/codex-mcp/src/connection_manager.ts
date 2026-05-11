import {
	CODEX_APPS_MCP_SERVER_NAME,
	ToolPluginProvenance,
} from "./mcp/mod";
import { ElicitationRequestManager, type ElicitationResponse } from "./elicitation";
import type { McpAuthStatusEntry } from "./mcp/auth";
import {
	type CodexAppsToolsCacheContext,
	write_cached_codex_apps_tools_if_needed,
} from "./codex_apps";
import {
	AsyncManagedClient,
	DEFAULT_STARTUP_TIMEOUT,
	ManagedClient,
	StartupOutcomeError,
	type AsyncManagedClientStartupStatus,
	type McpClientFactoryOptions,
	type McpServerConfig,
	type McpServerTransportConfig,
	type RmcpClientLike,
	list_tools_for_client_uncached,
} from "./rmcp_client";
import {
	ToolFilter,
	type ToolInfo,
	filter_tools,
	qualify_tools,
	tool_with_model_visible_input_schema,
} from "./tools";

export type McpConnectionManagerInput = {
	clients?: ReadonlyMap<string, AsyncManagedClient> | Record<string, AsyncManagedClient>;
	server_origins?: ReadonlyMap<string, string> | Record<string, string>;
	host_owned_codex_apps_enabled?: boolean;
	elicitation_requests?: ElicitationRequestManager | null;
};

export type McpStartupFailure = {
	server: string;
	error: string;
};

export type McpStartupStatus = AsyncManagedClientStartupStatus;

export class McpConnectionManager {
	readonly clients = new Map<string, AsyncManagedClient>();
	private readonly server_origins = new Map<string, string>();
	private readonly elicitation_requests: ElicitationRequestManager;
	private host_owned_codex_apps_enabled: boolean;
	private startup_cancelled = false;

	constructor(input: McpConnectionManagerInput = {}) {
		for (const [serverName, client] of map_entries(input.clients)) {
			this.clients.set(serverName, client);
		}
		for (const [serverName, origin] of map_entries(input.server_origins)) {
			this.server_origins.set(serverName, origin);
		}
		this.host_owned_codex_apps_enabled =
			input.host_owned_codex_apps_enabled ?? false;
		this.elicitation_requests =
			input.elicitation_requests ??
			new ElicitationRequestManager("on-failure", { type: "managed" });
	}

	static new_uninitialized(): McpConnectionManager {
		return new McpConnectionManager();
	}

	static from_managed_clients(
		clients: ReadonlyMap<string, ManagedClient> | Record<string, ManagedClient>,
	): McpConnectionManager {
		const asyncClients = new Map<string, AsyncManagedClient>();
		for (const [serverName, client] of map_entries(clients)) {
			asyncClients.set(serverName, AsyncManagedClient.from_managed_client(client));
		}
		return new McpConnectionManager({ clients: asyncClients });
	}

	static from_rmcp_clients(
		clients: ReadonlyMap<string, RmcpClientLike> | Record<string, RmcpClientLike>,
		options: {
			tool_filter_by_server?: ReadonlyMap<string, ToolFilter> | Record<string, ToolFilter>;
			tool_timeout?: number | null;
			codex_apps_tools_cache_context?: CodexAppsToolsCacheContext | null;
			tool_plugin_provenance?: ToolPluginProvenance;
		} = {},
	): McpConnectionManager {
		const asyncClients = new Map<string, AsyncManagedClient>();
		for (const [serverName, client] of map_entries(clients)) {
			asyncClients.set(
				serverName,
				AsyncManagedClient.new(serverName, {
					client,
					tool_filter: map_get(options.tool_filter_by_server, serverName),
					tool_timeout: options.tool_timeout,
					codex_apps_tools_cache_context:
						serverName === CODEX_APPS_MCP_SERVER_NAME
							? options.codex_apps_tools_cache_context
							: null,
					tool_plugin_provenance: options.tool_plugin_provenance,
				}),
			);
		}
		return new McpConnectionManager({ clients: asyncClients });
	}

	static from_config(
		mcp_servers:
			| ReadonlyMap<string, McpServerConfig>
			| Record<string, McpServerConfig>,
		options: {
			client_factory_options?: McpClientFactoryOptions;
			codex_apps_tools_cache_context?: CodexAppsToolsCacheContext | null;
			host_owned_codex_apps_enabled?: boolean;
			tool_plugin_provenance?: ToolPluginProvenance;
			elicitation_requests?: ElicitationRequestManager | null;
		} = {},
	): McpConnectionManager {
		const asyncClients = new Map<string, AsyncManagedClient>();
		const serverOrigins = new Map<string, string>();
		for (const [serverName, config] of map_entries(mcp_servers)) {
			if (config.enabled === false) {
				continue;
			}
			const origin = transport_origin(config.transport);
			if (origin) {
				serverOrigins.set(serverName, origin);
			}
			asyncClients.set(
				serverName,
				AsyncManagedClient.from_config(serverName, config, {
					client_factory_options: options.client_factory_options,
					codex_apps_tools_cache_context:
						serverName === CODEX_APPS_MCP_SERVER_NAME
							? options.codex_apps_tools_cache_context
							: null,
					tool_plugin_provenance: options.tool_plugin_provenance,
				}),
			);
		}
		return new McpConnectionManager({
			clients: asyncClients,
			server_origins: serverOrigins,
			host_owned_codex_apps_enabled: options.host_owned_codex_apps_enabled,
			elicitation_requests: options.elicitation_requests,
		});
	}

	has_servers(): boolean {
		return this.clients.size > 0;
	}

	begin_shutdown(): Promise<void> {
		this.startup_cancelled = true;
		const clients = [...this.clients.values()];
		this.clients.clear();
		this.server_origins.clear();
		return Promise.all(clients.map((client) => client.shutdown())).then(() => {});
	}

	async shutdown(): Promise<void> {
		await this.begin_shutdown();
	}

	server_origin(server_name: string): string | null {
		return this.server_origins.get(server_name) ?? null;
	}

	is_host_owned_codex_apps_server(server_name: string): boolean {
		return (
			this.host_owned_codex_apps_enabled &&
			server_name === CODEX_APPS_MCP_SERVER_NAME
		);
	}

	set_approval_policy(approval_policy: unknown): void {
		this.elicitation_requests.set_approval_policy(approval_policy);
	}

	set_permission_profile(permission_profile: unknown): void {
		this.elicitation_requests.set_permission_profile(permission_profile);
	}

	elicitations_auto_deny(): boolean {
		return this.elicitation_requests.auto_deny();
	}

	set_elicitations_auto_deny(auto_deny: boolean): void {
		this.elicitation_requests.set_auto_deny(auto_deny);
	}

	async resolve_elicitation(
		server_name: string,
		id: string | number,
		response: ElicitationResponse,
	): Promise<void> {
		await this.elicitation_requests.resolve(server_name, id, response);
	}

	async wait_for_server_ready(
		server_name: string,
		timeout_ms = DEFAULT_STARTUP_TIMEOUT,
	): Promise<boolean> {
		const client = this.clients.get(server_name);
		if (!client) {
			return false;
		}
		try {
			await with_timeout(client.client(), timeout_ms);
			return true;
		} catch {
			return false;
		}
	}

	async required_startup_failures(
		required_servers: readonly string[],
	): Promise<McpStartupFailure[]> {
		const failures: McpStartupFailure[] = [];
		for (const serverName of required_servers) {
			const client = this.clients.get(serverName);
			if (!client) {
				failures.push({
					server: serverName,
					error: `required MCP server \`${serverName}\` was not initialized`,
				});
				continue;
			}
			try {
				await client.client();
			} catch (error) {
				failures.push({
					server: serverName,
					error: startup_outcome_error_message(error),
				});
			}
		}
		return failures;
	}

	startup_statuses(): Map<string, McpStartupStatus> {
		const statuses = new Map<string, McpStartupStatus>();
		for (const [serverName, client] of this.clients.entries()) {
			statuses.set(serverName, client.startup_status());
		}
		return statuses;
	}

	async list_all_tools(): Promise<Map<string, ToolInfo>> {
		const tools: ToolInfo[] = [];
		for (const managedClient of this.clients.values()) {
			const listed = await managedClient.listed_tools();
			if (listed) {
				tools.push(...listed);
			}
		}
		return qualify_tools(tools);
	}

	async hard_refresh_codex_apps_tools_cache(): Promise<Map<string, ToolInfo>> {
		const managedClient = await this.client_by_name(CODEX_APPS_MCP_SERVER_NAME);
		if (!managedClient.client) {
			throw new Error(
				`unknown MCP server '${CODEX_APPS_MCP_SERVER_NAME}' or server has no live client`,
			);
		}
		let tools = await list_tools_for_client_uncached(
			CODEX_APPS_MCP_SERVER_NAME,
			managedClient.client,
			managedClient.tool_timeout,
			managedClient.server_instructions,
		);
		write_cached_codex_apps_tools_if_needed(
			CODEX_APPS_MCP_SERVER_NAME,
			managedClient.codex_apps_tools_cache_context,
			tools,
		);
		tools = filter_tools(tools, managedClient.tool_filter).map((tool) =>
			tool_with_model_visible_input_schema(tool),
		);
		return qualify_tools(tools);
	}

	async list_all_resources(): Promise<Map<string, unknown[]>> {
		const aggregated = new Map<string, unknown[]>();
		for (const [serverName, asyncClient] of this.clients.entries()) {
			try {
				const result = await (await asyncClient.client()).list_resources(null);
				aggregated.set(serverName, response_array(result, "resources"));
			} catch {
				continue;
			}
		}
		return aggregated;
	}

	async list_all_resource_templates(): Promise<Map<string, unknown[]>> {
		const aggregated = new Map<string, unknown[]>();
		for (const [serverName, asyncClient] of this.clients.entries()) {
			try {
				const result = await (await asyncClient.client()).list_resource_templates(
					null,
				);
				aggregated.set(serverName, response_array(result, "resource_templates"));
			} catch {
				continue;
			}
		}
		return aggregated;
	}

	async call_tool(
		server: string,
		tool: string,
		arguments_: unknown,
		meta?: unknown,
	): Promise<unknown> {
		const client = await this.client_by_name(server);
		try {
			return await client.call_tool(tool, arguments_, meta);
		} catch (error) {
			if (error instanceof Error && error.message === `tool '${tool}' is disabled`) {
				throw new Error(`tool '${tool}' is disabled for MCP server '${server}'`);
			}
			throw error;
		}
	}

	async server_supports_sandbox_state_meta_capability(
		server: string,
	): Promise<boolean> {
		return (await this.client_by_name(server))
			.server_supports_sandbox_state_meta_capability;
	}

	async list_resources(server: string, params?: unknown): Promise<unknown> {
		return (await this.client_by_name(server)).list_resources(params);
	}

	async list_resource_templates(server: string, params?: unknown): Promise<unknown> {
		return (await this.client_by_name(server)).list_resource_templates(params);
	}

	async read_resource(server: string, params: unknown): Promise<unknown> {
		return (await this.client_by_name(server)).read_resource(params);
	}

	async resolve_tool_info(
		tool_name: string | { namespace?: string | null; name: string },
	): Promise<ToolInfo | null> {
		const target =
			typeof tool_name === "string"
				? tool_name
				: tool_name.namespace
					? `${tool_name.namespace}.${tool_name.name}`
					: tool_name.name;
		const allTools = await this.list_all_tools();
		for (const tool of allTools.values()) {
			if (`${tool.callable_namespace}.${tool.callable_name}` === target) {
				return tool;
			}
		}
		return null;
	}

	private async client_by_name(name: string): Promise<ManagedClient> {
		if (this.startup_cancelled) {
			throw StartupOutcomeError.cancelled();
		}
		const client = this.clients.get(name);
		if (!client) {
			throw new Error(`unknown MCP server '${name}'`);
		}
		try {
			return await client.client();
		} catch (error) {
			throw new Error(`failed to get client: ${startup_outcome_error_message(error)}`);
		}
	}
}

export function transport_origin(
	transport: McpServerTransportConfig,
): string | null {
	if (transport.type === "stdio") {
		return "stdio";
	}
	try {
		return new URL(transport.url).origin;
	} catch {
		return null;
	}
}

export function mcp_init_error_display(
	server_name: string,
	entry: McpAuthStatusEntry | null | undefined,
	err: unknown,
): string {
	const transport = entry?.config?.transport;
	const error = startup_outcome_error_message(err);
	if (
		transport?.type === "streamable_http" &&
		transport.url === "https://api.githubcopilot.com/mcp/" &&
		!transport.bearer_token_env_var &&
		!has_headers(transport.http_headers)
	) {
		return `GitHub MCP does not support OAuth. Log in by adding a personal access token (https://github.com/settings/personal-access-tokens) to your environment and config.toml:\n[mcp_servers.${server_name}]\nbearer_token_env_var = CODEX_GITHUB_PERSONAL_ACCESS_TOKEN`;
	}
	if (is_mcp_client_auth_required_error(err)) {
		return `The ${server_name} MCP server is not logged in. Run \`codex mcp login ${server_name}\`.`;
	}
	if (is_mcp_client_startup_timeout_error(err)) {
		const startupTimeoutSecs = entry?.config?.startup_timeout_sec ?? 30;
		return `MCP client for \`${server_name}\` timed out after ${startupTimeoutSecs} seconds. Add or adjust \`startup_timeout_sec\` in your config.toml:\n[mcp_servers.${server_name}]\nstartup_timeout_sec = XX`;
	}
	return `MCP client for \`${server_name}\` failed to start: ${error}`;
}

export function startup_outcome_error_message(error: unknown): string {
	if (error instanceof StartupOutcomeError) {
		return error.kind === "Cancelled"
			? "MCP startup cancelled"
			: (error.error ?? error.message);
	}
	return error instanceof Error ? error.message : String(error);
}

export function is_mcp_client_auth_required_error(error: unknown): boolean {
	return startup_outcome_error_message(error).includes("Auth required");
}

export function is_mcp_client_startup_timeout_error(error: unknown): boolean {
	const message = startup_outcome_error_message(error);
	return (
		message.includes("request timed out") ||
		message.includes("timed out handshaking with MCP server")
	);
}

function response_array(value: unknown, key: string): unknown[] {
	if (Array.isArray(value)) {
		return value;
	}
	if (value && typeof value === "object" && key in value) {
		const field = (value as Record<string, unknown>)[key];
		return Array.isArray(field) ? field : [];
	}
	return [];
}

function map_entries<T>(
	input?: ReadonlyMap<string, T> | Record<string, T>,
): Array<[string, T]> {
	if (!input) {
		return [];
	}
	return input instanceof Map ? [...input.entries()] : Object.entries(input);
}

function map_get<T>(
	input: ReadonlyMap<string, T> | Record<string, T> | undefined,
	key: string,
): T | undefined {
	if (!input) {
		return undefined;
	}
	return input instanceof Map ? input.get(key) : (input as Record<string, T>)[key];
}

async function with_timeout<T>(promise: Promise<T>, timeout_ms: number): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error("request timed out")),
					timeout_ms,
				);
			}),
		]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
}

function has_headers(headers?: Record<string, string> | null): boolean {
	return headers != null && Object.keys(headers).length > 0;
}
