import {
	CODEX_APPS_MCP_SERVER_NAME,
	ToolPluginProvenance,
	qualified_mcp_tool_name_prefix,
} from "./mcp/mod";
import {
	CachedCodexAppsToolsLoad,
	type CodexAppsToolsCacheContext,
	filter_disallowed_codex_apps_tools,
	load_cached_codex_apps_tools,
	load_startup_cached_codex_apps_tools_snapshot,
	normalize_codex_apps_callable_name,
	normalize_codex_apps_callable_namespace,
	normalize_codex_apps_tool_title,
	write_cached_codex_apps_tools_if_needed,
} from "./codex_apps";
import {
	ToolFilter,
	type ToolInfo,
	filter_tools,
	tool_with_model_visible_input_schema,
} from "./tools";

export const MCP_SANDBOX_STATE_META_CAPABILITY =
	"codex/sandbox-state-meta";
export const MCP_TOOLS_LIST_DURATION_METRIC =
	"codex.mcp.tools.list.duration_ms";
export const MCP_TOOLS_FETCH_UNCACHED_DURATION_METRIC =
	"codex.mcp.tools.fetch_uncached.duration_ms";
export const DEFAULT_STARTUP_TIMEOUT = 30_000;
export const DEFAULT_TOOL_TIMEOUT = 120_000;

export type McpServerTransportConfig =
	| {
			type: "streamable_http";
			url: string;
			bearer_token_env_var?: string | null;
			http_headers?: Record<string, string> | null;
			env_http_headers?: Record<string, string> | null;
			oauth_tokens_present?: boolean | null;
	  }
	| {
			type: "stdio";
			command: string;
			args?: readonly string[];
			env?: Record<string, string> | null;
			env_vars?: readonly string[];
			cwd?: string | null;
	  };

export type McpServerConfig = {
	transport: McpServerTransportConfig;
	enabled?: boolean;
	required?: boolean;
	startup_timeout_sec?: number | null;
	tool_timeout_sec?: number | null;
	enabled_tools?: readonly string[] | null;
	disabled_tools?: readonly string[] | null;
	experimental_environment?: string | null;
};

export type McpRuntimeEnvironment = {
	cwd?: string | null;
	environment_id?: string | null;
	remote?: boolean | null;
};

export type McpClientFactoryOptions = {
	fetch?: typeof fetch;
	environment?: Record<string, string | undefined>;
	stdio_server_launcher?: StdioServerLauncher | null;
	runtime_environment?: McpRuntimeEnvironment | null;
};

export type StdioServerLauncher = {
	launch(
		server_name: string,
		config: Extract<McpServerTransportConfig, { type: "stdio" }>,
		runtime_environment?: McpRuntimeEnvironment | null,
	): Promise<RmcpClientLike>;
};

export type McpJsonRpcMessage = {
	jsonrpc: "2.0";
	id?: string | number;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
};

export type McpJsonRpcTransport = {
	request(
		message: McpJsonRpcMessage,
		timeout?: number | null,
	): Promise<McpJsonRpcMessage>;
	notify?(message: McpJsonRpcMessage, timeout?: number | null): Promise<void>;
	close?(): Promise<void> | void;
};

export type RmcpRawTool = {
	name: string;
	title?: string | null;
	description?: string | null;
	input_schema?: unknown;
	meta?: unknown;
	connector_id?: string | null;
	connector_name?: string | null;
	connector_description?: string | null;
};

export type RmcpListToolsResult =
	| readonly ToolInfo[]
	| readonly RmcpRawTool[]
	| {
			tools: readonly (
				| ToolInfo
				| RmcpRawTool
				| ({ tool: RmcpRawTool } & Record<string, unknown>)
			)[];
	  };

export type RmcpClientLike = {
	initialize?: (timeout?: number | null) => Promise<RmcpInitializeResult>;
	list_tools?: (params?: unknown, timeout?: number | null) => Promise<RmcpListToolsResult>;
	call_tool?: (
		tool: string,
		arguments_: unknown,
		meta?: unknown,
		timeout?: number | null,
	) => Promise<unknown>;
	list_resources?: (params?: unknown, timeout?: number | null) => Promise<unknown>;
	list_resource_templates?: (
		params?: unknown,
		timeout?: number | null,
	) => Promise<unknown>;
	read_resource?: (params: unknown, timeout?: number | null) => Promise<unknown>;
	shutdown?: () => Promise<void> | void;
};

export type RmcpInitializeResult = {
	instructions?: string | null;
	capabilities?: {
		experimental?: Record<string, unknown> | null;
		[key: string]: unknown;
	} | null;
};

export type ManagedClientInput = {
	client?: RmcpClientLike | null;
	tools?: readonly ToolInfo[];
	tool_filter?: ToolFilter;
	tool_timeout?: number | null;
	server_instructions?: string | null;
	server_supports_sandbox_state_meta_capability?: boolean;
	codex_apps_tools_cache_context?: CodexAppsToolsCacheContext | null;
};

export class ManagedClient {
	readonly client: RmcpClientLike | null;
	readonly tools: readonly ToolInfo[];
	readonly tool_filter: ToolFilter;
	readonly tool_timeout: number | null;
	readonly server_instructions: string | null;
	readonly server_supports_sandbox_state_meta_capability: boolean;
	readonly codex_apps_tools_cache_context: CodexAppsToolsCacheContext | null;

	constructor(input: ManagedClientInput = {}) {
		this.client = input.client ?? null;
		this.tools = [...(input.tools ?? [])];
		this.tool_filter = input.tool_filter ?? new ToolFilter();
		this.tool_timeout = input.tool_timeout ?? DEFAULT_TOOL_TIMEOUT;
		this.server_instructions = input.server_instructions ?? null;
		this.server_supports_sandbox_state_meta_capability =
			input.server_supports_sandbox_state_meta_capability ?? false;
		this.codex_apps_tools_cache_context =
			input.codex_apps_tools_cache_context ?? null;
	}

	listed_tools(): ToolInfo[] {
		const cached = this.codex_apps_tools_cache_context
			? load_cached_codex_apps_tools(this.codex_apps_tools_cache_context)
			: CachedCodexAppsToolsLoad.Missing;
		if (cached.type === "Hit") {
			return filter_tools(cached.tools, this.tool_filter);
		}
		return [...this.tools];
	}

	async call_tool(tool: string, arguments_: unknown, meta?: unknown): Promise<unknown> {
		if (!this.tool_filter.allows(tool)) {
			throw new Error(`tool '${tool}' is disabled`);
		}
		if (!this.client?.call_tool) {
			throw new Error(`MCP client does not implement tool calls`);
		}
		return this.client.call_tool(tool, arguments_, meta, this.tool_timeout);
	}

	async list_resources(params?: unknown): Promise<unknown> {
		if (!this.client?.list_resources) {
			throw new Error(`MCP client does not implement resources/list`);
		}
		return this.client.list_resources(params, this.tool_timeout);
	}

	async list_resource_templates(params?: unknown): Promise<unknown> {
		if (!this.client?.list_resource_templates) {
			throw new Error(`MCP client does not implement resources/templates/list`);
		}
		return this.client.list_resource_templates(params, this.tool_timeout);
	}

	async read_resource(params: unknown): Promise<unknown> {
		if (!this.client?.read_resource) {
			throw new Error(`MCP client does not implement resources/read`);
		}
		return this.client.read_resource(params, this.tool_timeout);
	}

	async shutdown(): Promise<void> {
		await this.client?.shutdown?.();
	}
}

export type AsyncManagedClientInput = {
	client:
		| ManagedClient
		| Promise<ManagedClient>
		| (() => ManagedClient | Promise<ManagedClient>);
	startup_snapshot?: readonly ToolInfo[] | null;
	tool_plugin_provenance?: ToolPluginProvenance;
	cancel_token?: CancellationToken;
};

export type AsyncManagedClientStartupStatus =
	| { status: "starting" }
	| { status: "ready" }
	| { status: "cancelled" }
	| { status: "failed"; error: string };

export class AsyncManagedClient {
	private readonly client_promise: Promise<ManagedClient>;
	private readonly startup_snapshot: readonly ToolInfo[] | null;
	private readonly startup_complete: StartupCompleteFlag;
	private readonly tool_plugin_provenance: ToolPluginProvenance;
	private readonly cancel_token: CancellationToken;
	private startup_status_value: AsyncManagedClientStartupStatus = {
		status: "starting",
	};

	constructor(input: AsyncManagedClientInput) {
		this.startup_snapshot = input.startup_snapshot
			? [...input.startup_snapshot]
			: null;
		this.startup_complete = new StartupCompleteFlag();
		this.tool_plugin_provenance =
			input.tool_plugin_provenance ?? new ToolPluginProvenance();
		this.cancel_token = input.cancel_token ?? new CancellationToken();
		this.client_promise = Promise.resolve(
			typeof input.client === "function" ? input.client() : input.client,
		)
			.then(
				(client) => {
					this.startup_status_value = { status: "ready" };
					return client;
				},
				(error) => {
					const startupError =
						error instanceof StartupOutcomeError
							? error
							: StartupOutcomeError.failed(error_message(error));
					this.startup_status_value =
						startupError.kind === "Cancelled"
							? { status: "cancelled" }
							: {
									status: "failed",
									error: startup_outcome_error_message(startupError),
								};
					throw startupError;
				},
			)
			.finally(() => {
				this.startup_complete.store(true);
			});
	}

	static from_managed_client(
		client: ManagedClient,
		startup_snapshot?: readonly ToolInfo[] | null,
	): AsyncManagedClient {
		return new AsyncManagedClient({ client, startup_snapshot });
	}

	static new(
		server_name: string,
		input: {
			client:
				| RmcpClientLike
				| Promise<RmcpClientLike>
				| (() => RmcpClientLike | Promise<RmcpClientLike>);
			tool_filter?: ToolFilter;
			tool_timeout?: number | null;
			server_instructions?: string | null;
			codex_apps_tools_cache_context?: CodexAppsToolsCacheContext | null;
			tool_plugin_provenance?: ToolPluginProvenance;
		},
	): AsyncManagedClient {
		const toolFilter = input.tool_filter ?? new ToolFilter();
		const startupSnapshot = load_startup_cached_codex_apps_tools_snapshot(
			server_name,
			input.codex_apps_tools_cache_context,
		)?.filter((tool) => toolFilter.allows(tool.name));
		return new AsyncManagedClient({
			startup_snapshot: startupSnapshot ?? null,
			tool_plugin_provenance: input.tool_plugin_provenance,
			client: async () => {
				validate_mcp_server_name(server_name);
				const client =
					typeof input.client === "function"
						? await input.client()
						: await input.client;
				const tools = await list_tools_for_client_uncached(
					server_name,
					client,
					input.tool_timeout ?? DEFAULT_TOOL_TIMEOUT,
					input.server_instructions,
				);
				write_cached_codex_apps_tools_if_needed(
					server_name,
					input.codex_apps_tools_cache_context,
					tools,
				);
				return new ManagedClient({
					client,
					tools: filter_tools(tools, toolFilter),
					tool_filter: toolFilter,
					tool_timeout: input.tool_timeout,
					server_instructions: input.server_instructions,
					codex_apps_tools_cache_context: input.codex_apps_tools_cache_context,
				});
			},
		});
	}

	static from_config(
		server_name: string,
		config: McpServerConfig,
		options: {
			codex_apps_tools_cache_context?: CodexAppsToolsCacheContext | null;
			tool_plugin_provenance?: ToolPluginProvenance;
			client_factory_options?: McpClientFactoryOptions;
		} = {},
	): AsyncManagedClient {
		const toolFilter = ToolFilter.from_config(config);
		const startupSnapshot = load_startup_cached_codex_apps_tools_snapshot(
			server_name,
			options.codex_apps_tools_cache_context,
		)?.filter((tool) => toolFilter.allows(tool.name));
		return new AsyncManagedClient({
			startup_snapshot: startupSnapshot ?? null,
			tool_plugin_provenance: options.tool_plugin_provenance,
			client: async () => {
				const client = await make_rmcp_client(
					server_name,
					config,
					options.client_factory_options,
				);
				return start_server_task(server_name, client, {
					startup_timeout:
						seconds_to_ms(config.startup_timeout_sec) ??
						DEFAULT_STARTUP_TIMEOUT,
					tool_timeout:
						seconds_to_ms(config.tool_timeout_sec) ?? DEFAULT_TOOL_TIMEOUT,
					tool_filter: toolFilter,
					codex_apps_tools_cache_context:
						server_name === CODEX_APPS_MCP_SERVER_NAME
							? options.codex_apps_tools_cache_context
							: null,
				});
			},
		});
	}

	async client(): Promise<ManagedClient> {
		if (this.cancel_token.is_cancelled()) {
			throw StartupOutcomeError.cancelled();
		}
		try {
			return await this.client_promise;
		} catch (error) {
			if (error instanceof StartupOutcomeError) {
				throw error;
			}
			throw StartupOutcomeError.failed(error_message(error));
		}
	}

	async shutdown(): Promise<void> {
		this.cancel_token.cancel();
		if (!this.startup_complete.load()) {
			this.startup_status_value = { status: "cancelled" };
		}
		try {
			await (await this.client()).shutdown();
		} catch {
			return;
		}
	}

	startup_status(): AsyncManagedClientStartupStatus {
		if (this.cancel_token.is_cancelled() && !this.startup_complete.load()) {
			return { status: "cancelled" };
		}
		return { ...this.startup_status_value };
	}

	async listed_tools(): Promise<ToolInfo[] | null> {
		const startupSnapshot = this.startup_snapshot_while_initializing();
		const tools = startupSnapshot ?? (await this.listed_tools_from_client());
		return tools ? this.annotate_tools(tools) : null;
	}

	private startup_snapshot_while_initializing(): ToolInfo[] | null {
		if (this.startup_complete.load()) {
			return null;
		}
		return this.startup_snapshot ? [...this.startup_snapshot] : null;
	}

	private async listed_tools_from_client(): Promise<ToolInfo[] | null> {
		try {
			return (await this.client()).listed_tools();
		} catch {
			return this.startup_snapshot ? [...this.startup_snapshot] : null;
		}
	}

	private annotate_tools(tools: readonly ToolInfo[]): ToolInfo[] {
		return tools.map((inputTool) => {
			let tool =
				inputTool.server_name === CODEX_APPS_MCP_SERVER_NAME
					? tool_with_model_visible_input_schema(inputTool)
					: { ...inputTool };
			const pluginNames = tool.connector_id
				? this.tool_plugin_provenance.plugin_display_names_for_connector_id(
						tool.connector_id,
					)
				: this.tool_plugin_provenance.plugin_display_names_for_mcp_server_name(
						tool.server_name,
					);
			tool = {
				...tool,
				plugin_display_names: [...pluginNames],
			};
			if (pluginNames.length === 0) {
				return tool;
			}
			const note =
				pluginNames.length === 1
					? `This tool is part of plugin \`${pluginNames[0]}\`.`
					: `This tool is part of plugins ${pluginNames.map((name) => `\`${name}\``).join(", ")}.`;
			const description = tool.description?.trim() ?? "";
			return {
				...tool,
				description: description
					? `${description}${/[.!?]$/.test(description) ? "" : "."} ${note}`
					: note,
			};
		});
	}
}

export class StartupOutcomeError extends Error {
	private constructor(
		readonly kind: "Cancelled" | "Failed",
		message: string,
		readonly error?: string,
	) {
		super(message);
		this.name = "StartupOutcomeError";
	}

	static cancelled(): StartupOutcomeError {
		return new StartupOutcomeError("Cancelled", "MCP startup cancelled");
	}

	static failed(error: string): StartupOutcomeError {
		return new StartupOutcomeError(
			"Failed",
			`MCP startup failed: ${error}`,
			error,
		);
	}
}

export class CancellationToken {
	private cancelled = false;

	cancel(): void {
		this.cancelled = true;
	}

	is_cancelled(): boolean {
		return this.cancelled;
	}

	child_token(): CancellationToken {
		return this;
	}
}

export function elicitation_capability_for_server(): Record<string, never> {
	return {};
}

export async function start_server_task(
	server_name: string,
	client: RmcpClientLike,
	params: {
		startup_timeout?: number | null;
		tool_timeout?: number | null;
		tool_filter?: ToolFilter;
		codex_apps_tools_cache_context?: CodexAppsToolsCacheContext | null;
	},
): Promise<ManagedClient> {
	const initializeResult = client.initialize
		? await client.initialize(params.startup_timeout ?? DEFAULT_STARTUP_TIMEOUT)
		: null;
	const serverInstructions = initializeResult?.instructions ?? null;
	const tools = await list_tools_for_client_uncached(
		server_name,
		client,
		params.startup_timeout ?? DEFAULT_STARTUP_TIMEOUT,
		serverInstructions,
	);
	write_cached_codex_apps_tools_if_needed(
		server_name,
		params.codex_apps_tools_cache_context,
		tools,
	);
	const toolFilter = params.tool_filter ?? new ToolFilter();
	return new ManagedClient({
		client,
		tools: filter_tools(tools, toolFilter),
		tool_filter: toolFilter,
		tool_timeout: params.tool_timeout ?? DEFAULT_TOOL_TIMEOUT,
		server_instructions: serverInstructions,
		server_supports_sandbox_state_meta_capability: Boolean(
			initializeResult?.capabilities?.experimental?.[
				MCP_SANDBOX_STATE_META_CAPABILITY
			],
		),
		codex_apps_tools_cache_context: params.codex_apps_tools_cache_context,
	});
}

export async function make_rmcp_client(
	server_name: string,
	config: McpServerConfig,
	options: McpClientFactoryOptions = {},
): Promise<RmcpClientLike> {
	validate_mcp_server_name(server_name);
	if (config.enabled === false) {
		throw new Error(`MCP server '${server_name}' is disabled`);
	}
	validate_runtime_environment(server_name, config, options.runtime_environment);

	switch (config.transport.type) {
		case "streamable_http":
			return new RmcpJsonRpcClient(
				new StreamableHttpMcpTransport({
					url: config.transport.url,
					headers: resolve_streamable_http_headers(
						server_name,
						config.transport,
						options.environment,
					),
					fetch: options.fetch,
				}),
			);
		case "stdio": {
			const launcher = options.stdio_server_launcher;
			if (!launcher) {
				throw new Error(
					`MCP stdio server '${server_name}' requires a stdio_server_launcher platform adapter`,
				);
			}
			return launcher.launch(
				server_name,
				config.transport,
				options.runtime_environment,
			);
		}
	}
}

export class RmcpJsonRpcClient implements RmcpClientLike {
	private next_id = 1;

	constructor(readonly transport: McpJsonRpcTransport) {}

	async initialize(timeout?: number | null): Promise<RmcpInitializeResult> {
		const result = await this.request("initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {
				elicitation: elicitation_capability_for_server(),
			},
			clientInfo: {
				name: "codex-mcp-client",
				title: "Codex",
				version: "0.0.0",
			},
		}, timeout);
		await this.notify("notifications/initialized", undefined, timeout);
		return is_record(result) ? result : {};
	}

	async list_tools(
		params?: unknown,
		timeout?: number | null,
	): Promise<RmcpListToolsResult> {
		const result = await this.request("tools/list", params ?? null, timeout);
		return normalize_rmcp_tools_result(result);
	}

	async call_tool(
		tool: string,
		arguments_: unknown,
		meta?: unknown,
		timeout?: number | null,
	): Promise<unknown> {
		return this.request(
			"tools/call",
			omit_undefined({
				name: tool,
				arguments: arguments_ ?? {},
				_meta: meta,
			}),
			timeout,
		);
	}

	async list_resources(params?: unknown, timeout?: number | null): Promise<unknown> {
		return this.request("resources/list", params ?? null, timeout);
	}

	async list_resource_templates(
		params?: unknown,
		timeout?: number | null,
	): Promise<unknown> {
		return this.request("resources/templates/list", params ?? null, timeout);
	}

	async read_resource(params: unknown, timeout?: number | null): Promise<unknown> {
		return this.request("resources/read", params, timeout);
	}

	async shutdown(): Promise<void> {
		await this.transport.close?.();
	}

	private async request(
		method: string,
		params?: unknown,
		timeout?: number | null,
	): Promise<unknown> {
		const id = this.next_id++;
		const response = await this.transport.request(
			omit_undefined({
				jsonrpc: "2.0" as const,
				id,
				method,
				params,
			}),
			timeout,
		);
		if (response.error) {
			throw new Error(response.error.message);
		}
		return response.result;
	}

	private async notify(
		method: string,
		params?: unknown,
		timeout?: number | null,
	): Promise<void> {
		const message = omit_undefined({
			jsonrpc: "2.0" as const,
			method,
			params,
		});
		if (this.transport.notify) {
			await this.transport.notify(message, timeout);
		}
	}
}

export class StreamableHttpMcpTransport implements McpJsonRpcTransport {
	private readonly fetch_impl: typeof fetch;
	private readonly headers: Record<string, string>;

	constructor(input: {
		url: string;
		headers?: Record<string, string>;
		fetch?: typeof fetch;
	}) {
		this.url = input.url;
		this.headers = input.headers ?? {};
		this.fetch_impl = input.fetch ?? globalThis.fetch;
		if (!this.fetch_impl) {
			throw new Error("streamable HTTP MCP transport requires fetch");
		}
	}

	readonly url: string;

	async request(
		message: McpJsonRpcMessage,
		timeout?: number | null,
	): Promise<McpJsonRpcMessage> {
		const response = await this.post(message, timeout);
		const parsed = await parse_streamable_http_response(response);
		const result = find_json_rpc_response(parsed, message.id);
		if (!result) {
			throw new Error(
				"streamable HTTP MCP response did not include a matching JSON-RPC response",
			);
		}
		return result;
	}

	async notify(
		message: McpJsonRpcMessage,
		timeout?: number | null,
	): Promise<void> {
		await this.post(message, timeout);
	}

	private async post(
		message: McpJsonRpcMessage,
		timeout?: number | null,
	): Promise<Response> {
		const controller = new AbortController();
		const timeoutId =
			timeout && timeout > 0
				? setTimeout(() => controller.abort(), timeout)
				: null;
		try {
			const response = await this.fetch_impl(this.url, {
				method: "POST",
				headers: {
					Accept: "application/json, text/event-stream",
					"Content-Type": "application/json",
					...this.headers,
				},
				body: JSON.stringify(message),
				signal: controller.signal,
			});
			if (!response.ok) {
				throw new Error(
					`streamable HTTP MCP request failed with ${response.status}`,
				);
			}
			return response;
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		}
	}
}

export class UnsupportedStdioServerLauncher implements StdioServerLauncher {
	async launch(server_name: string): Promise<RmcpClientLike> {
		throw new Error(
			`MCP stdio server '${server_name}' requires a host-provided launcher`,
		);
	}
}

export async function list_tools_for_client_uncached(
	server_name: string,
	client: RmcpClientLike,
	timeout?: number | null,
	server_instructions?: string | null,
): Promise<ToolInfo[]> {
	if (!client.list_tools) {
		return [];
	}
	const response = await client.list_tools(null, timeout);
	const rawTools = normalize_list_tools_response(response);
	const tools = rawTools.map((rawTool) =>
		tool_info_from_raw(server_name, rawTool, server_instructions),
	);
	return server_name === CODEX_APPS_MCP_SERVER_NAME
		? filter_disallowed_codex_apps_tools(tools)
		: tools;
}

export function validate_mcp_server_name(server_name: string): void {
	if (!/^[a-zA-Z0-9_-]+$/.test(server_name)) {
		throw new Error(
			`Invalid MCP server name '${server_name}': must match pattern ^[a-zA-Z0-9_-]+$`,
		);
	}
}

function normalize_list_tools_response(
	response: RmcpListToolsResult,
): Array<
	ToolInfo | RmcpRawTool | ({ tool: RmcpRawTool } & Record<string, unknown>)
> {
	if (Array.isArray(response)) {
		return [...response];
	}
	return [
		...(
			response as {
				tools: readonly (
					| ToolInfo
					| RmcpRawTool
					| ({ tool: RmcpRawTool } & Record<string, unknown>)
				)[];
			}
		).tools,
	];
}

function normalize_rmcp_tools_result(result: unknown): RmcpListToolsResult {
	if (Array.isArray(result)) {
		return result as RmcpListToolsResult;
	}
	if (is_record(result) && Array.isArray(result.tools)) {
		return {
			tools: result.tools as RmcpListToolsResult extends infer _T
				? readonly (
						| ToolInfo
						| RmcpRawTool
						| ({ tool: RmcpRawTool } & Record<string, unknown>)
					)[]
				: never,
		};
	}
	return { tools: [] };
}

function resolve_streamable_http_headers(
	server_name: string,
	transport: Extract<McpServerTransportConfig, { type: "streamable_http" }>,
	environment: Record<string, string | undefined> = {},
): Record<string, string> {
	const headers: Record<string, string> = {
		...(transport.http_headers ?? {}),
	};
	for (const [headerName, envName] of Object.entries(transport.env_http_headers ?? {})) {
		const value = environment[envName];
		if (!value) {
			throw new Error(
				`Environment variable ${envName} for MCP server '${server_name}' is not set`,
			);
		}
		headers[headerName] = value;
	}
	if (transport.bearer_token_env_var) {
		const token = environment[transport.bearer_token_env_var];
		if (!token) {
			throw new Error(
				`Environment variable ${transport.bearer_token_env_var} for MCP server '${server_name}' is not set`,
			);
		}
		headers.Authorization = `Bearer ${token}`;
	}
	return headers;
}

function validate_runtime_environment(
	server_name: string,
	config: McpServerConfig,
	runtime_environment?: McpRuntimeEnvironment | null,
): void {
	const environment = config.experimental_environment;
	if (!environment || environment === "local") {
		return;
	}
	if (environment === "remote") {
		if (!runtime_environment?.remote) {
			throw new Error(
				`remote MCP server '${server_name}' requires a remote environment`,
			);
		}
		return;
	}
	throw new Error(
		`unsupported experimental_environment '${environment}' for MCP server '${server_name}'`,
	);
}

async function parse_streamable_http_response(
	response: Response,
): Promise<McpJsonRpcMessage[]> {
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("text/event-stream")) {
		return parse_sse_json_rpc_messages(await response.text());
	}
	const value = (await response.json()) as unknown;
	return Array.isArray(value)
		? value.filter(is_json_rpc_message)
		: is_json_rpc_message(value)
			? [value]
			: [];
}

function parse_sse_json_rpc_messages(text: string): McpJsonRpcMessage[] {
	const messages: McpJsonRpcMessage[] = [];
	let dataLines: string[] = [];
	const flush = () => {
		if (dataLines.length === 0) {
			return;
		}
		const data = dataLines.join("\n");
		dataLines = [];
		if (data.trim() === "[DONE]") {
			return;
		}
		try {
			const parsed = JSON.parse(data) as unknown;
			if (is_json_rpc_message(parsed)) {
				messages.push(parsed);
			}
		} catch {
			return;
		}
	};
	for (const line of text.split(/\r?\n/)) {
		if (line === "") {
			flush();
			continue;
		}
		if (line.startsWith("data:")) {
			dataLines.push(line.slice("data:".length).trimStart());
		}
	}
	flush();
	return messages;
}

function find_json_rpc_response(
	messages: readonly McpJsonRpcMessage[],
	id: string | number | undefined,
): McpJsonRpcMessage | null {
	return messages.find((message) => message.id === id) ?? null;
}

function is_json_rpc_message(value: unknown): value is McpJsonRpcMessage {
	return is_record(value) && value.jsonrpc === "2.0";
}

function tool_info_from_raw(
	serverName: string,
	raw:
		| ToolInfo
		| RmcpRawTool
		| ({ tool: RmcpRawTool } & Record<string, unknown>),
	serverInstructions?: string | null,
): ToolInfo {
	if (is_tool_info(raw)) {
		return {
			...raw,
			plugin_display_names: [...(raw.plugin_display_names ?? [])],
		};
	}
	const envelope = "tool" in raw ? raw : { tool: raw };
	const rawTool = envelope.tool;
	const connectorId =
		typeof envelope.connector_id === "string"
			? envelope.connector_id
			: rawTool.connector_id ?? null;
	const connectorName =
		typeof envelope.connector_name === "string"
			? envelope.connector_name
			: rawTool.connector_name ?? null;
	const connectorDescription =
		typeof envelope.connector_description === "string"
			? envelope.connector_description
			: rawTool.connector_description ?? null;
	const callableName = normalize_codex_apps_callable_name(
		serverName,
		rawTool.name,
		connectorId,
		connectorName,
	);
	const callableNamespace =
		serverName === CODEX_APPS_MCP_SERVER_NAME
			? normalize_codex_apps_callable_namespace(serverName, connectorName)
			: qualified_mcp_tool_name_prefix(serverName);
	const title = rawTool.title
		? normalize_codex_apps_tool_title(serverName, connectorName, rawTool.title)
		: null;
	const hasConnectorMetadata =
		connectorId != null || connectorName != null || connectorDescription != null;
	return {
		server_name: serverName,
		name: rawTool.name,
		callable_name: callableName,
		callable_namespace: callableNamespace,
		namespace_description: hasConnectorMetadata
			? connectorDescription
			: (serverInstructions ?? null),
		title,
		description: rawTool.description ?? null,
		input_schema: rawTool.input_schema ?? { type: "object" },
		meta: rawTool.meta,
		connector_id: connectorId,
		connector_name: connectorName,
		plugin_display_names: [],
	};
}

function is_tool_info(value: unknown): value is ToolInfo {
	return (
		typeof value === "object" &&
		value !== null &&
		"server_name" in value &&
		"name" in value
	);
}

function is_record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function omit_undefined<T extends Record<string, unknown>>(
	input: T,
): T {
	return Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined),
	) as T;
}

function seconds_to_ms(seconds?: number | null): number | null {
	return typeof seconds === "number" ? seconds * 1000 : null;
}

function error_message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function startup_outcome_error_message(error: StartupOutcomeError): string {
	return error.kind === "Cancelled"
		? "MCP startup cancelled"
		: (error.error ?? error.message);
}

class StartupCompleteFlag {
	private value = false;

	store(value: boolean): void {
		this.value = value;
	}

	load(): boolean {
		return this.value;
	}
}
