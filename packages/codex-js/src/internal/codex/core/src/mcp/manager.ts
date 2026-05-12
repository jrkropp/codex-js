import type {
	McpResourceReadParams,
	McpResourceReadResponse,
	McpResourceInfo,
	McpResourceListParams,
	McpResourceListResponse,
	McpResourceTemplateInfo,
	McpResourceTemplateListResponse,
	McpAuthStatus,
	McpRuntimeEnvironment,
	McpServerElicitationResponse,
	McpServerRefreshConfig,
	McpServerStatusListOptions,
	McpServerStatus,
	McpServerToolCallParams,
	McpServerToolCallResponse,
	McpToolInfo,
	McpRequestId,
} from "./types";
import {
	McpServerStartupState,
	mcpToolCallableName,
	mcpToolCallableNamespace,
} from "./types";
import { qualify_tool_infos } from "../../../codex-mcp/src/tools";
import {
	McpConnectionManager as CodexMcpConnectionManager,
	mcp_init_error_display,
	type McpStartupFailure,
} from "../../../codex-mcp/src/connection_manager";
import {
	compute_auth_statuses,
	type McpAuthStatusEntry,
} from "../../../codex-mcp/src/mcp/auth";
import type {
	McpClientFactoryOptions,
	McpServerConfig as CodexMcpServerConfig,
	McpServerTransportConfig,
} from "../../../codex-mcp/src/rmcp_client";

export interface McpConnectionManager {
	refresh_mcp_servers_now(
		config: McpServerRefreshConfig,
		environment: McpRuntimeEnvironment,
	): Promise<void>;
	list_server_statuses(
		options?: McpServerStatusListOptions,
	): Promise<McpServerStatus[]>;
	list_resources(params: McpResourceListParams): Promise<McpResourceListResponse>;
	list_resource_templates(
		params: McpResourceListParams,
	): Promise<McpResourceTemplateListResponse>;
	read_resource(params: McpResourceReadParams): Promise<McpResourceReadResponse>;
	call_tool(params: McpServerToolCallParams): Promise<McpServerToolCallResponse>;
	resolve_tool_info(serverName: string, toolName: string): Promise<McpToolInfo | null>;
	list_tools(): Promise<McpToolInfo[]>;
	resolve_elicitation(
		serverName: string,
		id: McpRequestId,
		response: McpServerElicitationResponse,
	): Promise<void>;
	shutdown(): Promise<void>;
}

export class EmptyMcpConnectionManager implements McpConnectionManager {
	static readonly instance = new EmptyMcpConnectionManager();

	async refresh_mcp_servers_now(): Promise<void> {
		return;
	}

	async list_server_statuses(): Promise<McpServerStatus[]> {
		return [];
	}

	async list_resources(params: McpResourceListParams): Promise<McpResourceListResponse> {
		throw new Error(`MCP server is unavailable: ${params.server_name ?? "all"}`);
	}

	async list_resource_templates(
		params: McpResourceListParams,
	): Promise<McpResourceTemplateListResponse> {
		throw new Error(`MCP server is unavailable: ${params.server_name ?? "all"}`);
	}

	async read_resource(params: McpResourceReadParams): Promise<McpResourceReadResponse> {
		throw new Error(`MCP server is unavailable: ${params.server_name}`);
	}

	async call_tool(params: McpServerToolCallParams): Promise<McpServerToolCallResponse> {
		throw new Error(
			`MCP tool is unavailable: ${params.server_name}.${params.tool_name}`,
		);
	}

	async resolve_tool_info(): Promise<McpToolInfo | null> {
		return null;
	}

	async list_tools(): Promise<McpToolInfo[]> {
		return [];
	}

	async resolve_elicitation(serverName: string): Promise<void> {
		throw new Error(`MCP server is unavailable: ${serverName}`);
	}

	async shutdown(): Promise<void> {
		return;
	}
}

export type CodexMcpConnectionManagerAdapterOptions = {
	client_factory_options?: McpClientFactoryOptions;
};

export class CodexMcpConnectionManagerAdapter implements McpConnectionManager {
	private manager: CodexMcpConnectionManager;
	private readonly client_factory_options?: McpClientFactoryOptions;
	private configured_servers = new Map<string, CodexMcpServerConfig>();
	private auth_statuses = new Map<string, McpAuthStatusEntry>();

	constructor(
		manager: CodexMcpConnectionManager =
			CodexMcpConnectionManager.new_uninitialized(),
		options: CodexMcpConnectionManagerAdapterOptions = {},
	) {
		this.manager = manager;
		this.client_factory_options = options.client_factory_options;
	}

	async refresh_mcp_servers_now(
		config: McpServerRefreshConfig,
		environment: McpRuntimeEnvironment,
	): Promise<void> {
		const servers = normalize_mcp_server_configs(config.mcp_servers);
		const authStatuses = await compute_auth_statuses(
			servers,
			config.mcp_oauth_credentials_store_mode,
		);
		const refreshed = CodexMcpConnectionManager.from_config(servers, {
			client_factory_options: {
				...this.client_factory_options,
				runtime_environment: {
					...this.client_factory_options?.runtime_environment,
					cwd: environment.cwd,
					environment_id: environment.environment_id,
				},
			},
		});
		await refreshed.list_all_tools();
		const previous = this.manager;
		this.manager = refreshed;
		this.configured_servers = servers;
		this.auth_statuses = authStatuses;
		await previous.shutdown();
	}

	async list_server_statuses(
		options: McpServerStatusListOptions = {},
	): Promise<McpServerStatus[]> {
		const tools = [...(await this.manager.list_all_tools()).values()];
		const includeInventory = options.detail !== "toolsAndAuthOnly";
		const resources = includeInventory
			? await this.manager.list_all_resources()
			: new Map<string, McpResourceInfo[]>();
		const resourceTemplates = includeInventory
			? await this.manager.list_all_resource_templates()
			: new Map<string, McpResourceTemplateInfo[]>();
		const startupStatuses = this.manager.startup_statuses();
		const serverNames = new Set([
			...this.configured_servers.keys(),
			...startupStatuses.keys(),
			...tools.map((tool) => tool.server_name),
			...resources.keys(),
			...resourceTemplates.keys(),
		]);
		return [...serverNames].sort().map((name) => {
			const configured = this.configured_servers.get(name);
			const startupStatus =
				configured?.enabled === false
					? { status: "cancelled" as const }
					: startupStatuses.get(name) ?? { status: "ready" as const };
			const startup_state = mcpStartupState(startupStatus.status);
			const authStatus = coreAuthStatus(
				this.auth_statuses.get(name)?.auth_status ?? "unsupported",
			);
			return {
				name,
				startup_state,
				error: mcpStatusError(name, startupStatus, this.auth_statuses.get(name)),
				tools: tools
					.filter((tool) => tool.server_name === name)
					.map((tool) => ({ ...tool })),
				resources: [...(resources.get(name) ?? [])] as McpResourceInfo[],
				resource_templates: [
					...(resourceTemplates.get(name) ?? []),
				] as McpResourceTemplateInfo[],
				auth_status: authStatus,
				authStatus,
				oauth: oauthStatus(authStatus),
			};
		});
	}

	async list_resources(
		params: McpResourceListParams,
	): Promise<McpResourceListResponse> {
		if (params.server_name) {
			const result = await this.manager.list_resources(params.server_name, {
				cursor: params.cursor ?? null,
			});
			return {
				server_name: params.server_name,
				resources: responseArray(result, "resources") as McpResourceInfo[],
				next_cursor: responseCursor(result),
			};
		}

		const resources = await this.manager.list_all_resources();
		return {
			server_name: null,
			resources: [...resources.entries()].flatMap(([server, entries]) =>
				entries.map((resource) => ({
					...(resource as Record<string, unknown>),
					server,
				})),
			) as unknown as McpResourceInfo[],
			next_cursor: null,
		};
	}

	async list_resource_templates(
		params: McpResourceListParams,
	): Promise<McpResourceTemplateListResponse> {
		if (params.server_name) {
			const result = await this.manager.list_resource_templates(params.server_name, {
				cursor: params.cursor ?? null,
			});
			return {
				server_name: params.server_name,
				resource_templates: responseArray(
					result,
					"resource_templates",
				) as McpResourceTemplateInfo[],
				next_cursor: responseCursor(result),
			};
		}

		const templates = await this.manager.list_all_resource_templates();
		return {
			server_name: null,
			resource_templates: [...templates.entries()].flatMap(([server, entries]) =>
				entries.map((template) => ({
					...(template as Record<string, unknown>),
					server,
				})),
			) as unknown as McpResourceTemplateInfo[],
			next_cursor: null,
		};
	}

	async read_resource(
		params: McpResourceReadParams,
	): Promise<McpResourceReadResponse> {
		const result = await this.manager.read_resource(params.server_name, {
			uri: params.uri,
		});
		const record = isRecord(result) ? result : {};
		return {
			server_name: params.server_name,
			uri: params.uri,
			contents: Array.isArray(record.contents) ? record.contents : [],
		};
	}

	async call_tool(
		params: McpServerToolCallParams,
	): Promise<McpServerToolCallResponse> {
		let output: unknown;
		try {
			output = await this.manager.call_tool(
				params.server_name,
				params.tool_name,
				params.arguments,
				params.meta,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message === `unknown MCP server '${params.server_name}'`) {
				throw new Error(
					`MCP tool is unavailable: ${params.server_name}.${params.tool_name}`,
				);
			}
			throw error;
		}
		return {
			call_id: params.call_id ?? null,
			server_name: params.server_name,
			tool_name: params.tool_name,
			output,
			response_item: null,
		};
	}

	async resolve_tool_info(
		serverName: string,
		toolName: string,
	): Promise<McpToolInfo | null> {
		return this.manager.resolve_tool_info({
			namespace: serverName,
			name: toolName,
		});
	}

	async list_tools(): Promise<McpToolInfo[]> {
		return [...(await this.manager.list_all_tools()).values()].map((tool) => ({
			...tool,
		}));
	}

	async resolve_elicitation(
		serverName: string,
		id: McpRequestId,
		response: McpServerElicitationResponse,
	): Promise<void> {
		await this.manager.resolve_elicitation(serverName, id, response);
	}

	async shutdown(): Promise<void> {
		await this.manager.shutdown();
	}

	async required_startup_failures(
		required_servers: readonly string[],
	): Promise<McpStartupFailure[]> {
		return this.manager.required_startup_failures(required_servers);
	}
}

export function normalize_mcp_server_configs(
	input: Record<string, unknown>,
): Map<string, CodexMcpServerConfig> {
	const output = new Map<string, CodexMcpServerConfig>();
	for (const [serverName, value] of Object.entries(input)) {
		output.set(serverName, normalize_mcp_server_config(serverName, value));
	}
	return output;
}

export function normalize_mcp_server_config(
	serverName: string,
	value: unknown,
): CodexMcpServerConfig {
	if (!isRecord(value)) {
		throw new Error(`MCP server '${serverName}' config must be an object`);
	}
	const transport = normalize_mcp_server_transport_config(serverName, value);
	return {
		transport,
		enabled: optionalBoolean(value.enabled),
		required: optionalBoolean(value.required),
		startup_timeout_sec:
			optionalNumber(value.startup_timeout_sec) ??
			millisecondsToSeconds(optionalNumber(value.startup_timeout_ms)),
		tool_timeout_sec: optionalNumber(value.tool_timeout_sec),
		enabled_tools: optionalStringArray(value.enabled_tools),
		disabled_tools: optionalStringArray(value.disabled_tools),
		experimental_environment: optionalString(value.experimental_environment),
	};
}

function normalize_mcp_server_transport_config(
	serverName: string,
	value: Record<string, unknown>,
): McpServerTransportConfig {
	const command = optionalString(value.command);
	const url = optionalString(value.url);
	if (command) {
		if (url) {
			throw new Error(
				`MCP server '${serverName}' config cannot set both command and url`,
			);
		}
		return {
			type: "stdio",
			command,
			args: optionalStringArray(value.args) ?? [],
			env: optionalStringRecord(value.env),
			env_vars: optionalStringArray(value.env_vars) ?? [],
			cwd: optionalString(value.cwd),
		};
	}
	if (url) {
		return {
			type: "streamable_http",
			url,
			bearer_token_env_var: optionalString(value.bearer_token_env_var),
			http_headers: optionalStringRecord(value.http_headers),
			env_http_headers: optionalStringRecord(value.env_http_headers),
			oauth_tokens_present: optionalBoolean(value.oauth_tokens_present),
		};
	}
	throw new Error(
		`MCP server '${serverName}' config must set command or url`,
	);
}

function mcpStartupState(
	status: "starting" | "ready" | "cancelled" | "failed",
): McpServerStartupState {
	switch (status) {
		case "starting":
			return McpServerStartupState.Starting;
		case "ready":
			return McpServerStartupState.Ready;
		case "cancelled":
			return McpServerStartupState.Cancelled;
		case "failed":
			return McpServerStartupState.Failed;
	}
}

function mcpStatusError(
	serverName: string,
	startupStatus:
		| { status: "starting" }
		| { status: "ready" }
		| { status: "cancelled" }
		| { status: "failed"; error: string },
	authEntry?: McpAuthStatusEntry,
): string | null {
	if (startupStatus.status === "failed") {
		return mcp_init_error_display(
			serverName,
			authEntry,
			new Error(startupStatus.error),
		);
	}
	if (startupStatus.status === "cancelled") {
		return "MCP startup cancelled";
	}
	return null;
}

function coreAuthStatus(status: McpAuthStatus): McpAuthStatus {
	return status;
}

function oauthStatus(authStatus: McpAuthStatus): McpServerStatus["oauth"] {
	switch (authStatus) {
		case "bearerToken":
		case "oAuth":
			return { status: "authenticated" };
		case "notLoggedIn":
			return { status: "required" };
		case "unsupported":
			return { status: "not_required" };
	}
}

export type StaticMcpConnectionManagerOptions = {
	resources?: Record<string, ReadonlyArray<McpResourceInfo>>;
	resource_templates?: Record<
		string,
		ReadonlyArray<McpResourceTemplateInfo>
	>;
	read_resources?: Record<string, McpResourceReadResponse>;
};

export class StaticMcpConnectionManager implements McpConnectionManager {
	private readonly tools: readonly McpToolInfo[];
	private readonly resources: Record<string, ReadonlyArray<McpResourceInfo>>;
	private readonly resource_templates: Record<
		string,
		ReadonlyArray<McpResourceTemplateInfo>
	>;
	private readonly read_resources: Record<string, McpResourceReadResponse>;

	constructor(
		tools: readonly McpToolInfo[] = [],
		options: StaticMcpConnectionManagerOptions = {},
	) {
		this.tools = qualify_tool_infos(tools);
		this.resources = options.resources ?? {};
		this.resource_templates = options.resource_templates ?? {};
		this.read_resources = options.read_resources ?? {};
	}

	async refresh_mcp_servers_now(): Promise<void> {
		return;
	}

	async list_server_statuses(
		options: McpServerStatusListOptions = {},
	): Promise<McpServerStatus[]> {
		const byServer = new Map<string, McpToolInfo[]>();
		for (const tool of this.tools) {
			const current = byServer.get(tool.server_name) ?? [];
			current.push(tool);
			byServer.set(tool.server_name, current);
		}
		const includeInventory = options.detail !== "toolsAndAuthOnly";
		const serverNames = new Set([
			...byServer.keys(),
			...Object.keys(this.resources),
			...Object.keys(this.resource_templates),
		]);
		return [...serverNames].sort().map((name) => ({
			name,
			startup_state: "ready",
			error: null,
			tools: (byServer.get(name) ?? []).map((tool) => ({ ...tool })),
			resources: includeInventory ? [...(this.resources[name] ?? [])] : [],
			resource_templates: includeInventory
				? [...(this.resource_templates[name] ?? [])]
				: [],
			auth_status: "unsupported",
			authStatus: "unsupported",
			oauth: { status: "not_required" },
		}));
	}

	async list_resources(params: McpResourceListParams): Promise<McpResourceListResponse> {
		if (params.server_name) {
			return {
				server_name: params.server_name,
				resources: [...(this.resources[params.server_name] ?? [])],
				next_cursor: null,
			};
		}

		return {
			server_name: null,
			resources: Object.entries(this.resources).flatMap(([server, resources]) =>
				resources.map(
					(resource) =>
						({
							...resource,
							server,
						}) as McpResourceListResponse["resources"][number],
				),
			),
			next_cursor: null,
		};
	}

	async list_resource_templates(
		params: McpResourceListParams,
	): Promise<McpResourceTemplateListResponse> {
		if (params.server_name) {
			return {
				server_name: params.server_name,
				resource_templates: [...(this.resource_templates[params.server_name] ?? [])],
				next_cursor: null,
			};
		}

		return {
			server_name: null,
			resource_templates: Object.entries(this.resource_templates).flatMap(
				([server, templates]) =>
					templates.map(
						(template) =>
							({
								...template,
								server,
							}) as McpResourceTemplateListResponse["resource_templates"][number],
					),
			),
			next_cursor: null,
		};
	}

	async read_resource(params: McpResourceReadParams): Promise<McpResourceReadResponse> {
		const key = `${params.server_name}\0${params.uri}`;
		const existing = this.read_resources[key];
		if (existing) {
			return {
				...existing,
				contents: [...existing.contents],
			};
		}
		throw new Error(`MCP resource is unavailable: ${params.server_name}:${params.uri}`);
	}

	async call_tool(params: McpServerToolCallParams): Promise<McpServerToolCallResponse> {
		throw new Error(
			`MCP tool is unavailable: ${params.server_name}.${params.tool_name}`,
		);
	}

	async resolve_tool_info(
		serverName: string,
		toolName: string,
	): Promise<McpToolInfo | null> {
		return (
			this.tools.find(
				(tool) =>
					(tool.server_name === serverName && tool.name === toolName) ||
					(mcpToolCallableNamespace(tool) === serverName &&
						mcpToolCallableName(tool) === toolName),
			) ?? null
		);
	}

	async list_tools(): Promise<McpToolInfo[]> {
		return this.tools.map((tool) => ({ ...tool }));
	}

	async resolve_elicitation(): Promise<void> {
		return;
	}

	async shutdown(): Promise<void> {
		return;
	}
}

function responseArray(value: unknown, key: string): unknown[] {
	if (Array.isArray(value)) {
		return value;
	}
	if (isRecord(value)) {
		const field = value[key];
		return Array.isArray(field) ? field : [];
	}
	return [];
}

function responseCursor(value: unknown): string | null {
	if (!isRecord(value)) {
		return null;
	}
	return typeof value.next_cursor === "string" ? value.next_cursor : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
	return Array.isArray(value) && value.every((item) => typeof item === "string")
		? [...value]
		: undefined;
}

function optionalStringRecord(value: unknown): Record<string, string> | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const output: Record<string, string> = {};
	for (const [key, recordValue] of Object.entries(value)) {
		if (typeof recordValue !== "string") {
			return undefined;
		}
		output[key] = recordValue;
	}
	return output;
}

function millisecondsToSeconds(value: number | undefined): number | undefined {
	return value == null ? undefined : value / 1000;
}
