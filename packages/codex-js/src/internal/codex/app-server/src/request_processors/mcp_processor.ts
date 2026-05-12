import type {
	McpResourceReadParams,
	McpResourceReadResponse,
	McpServerOauthLoginParams,
	McpServerOauthLoginResponse,
	McpServerRefreshResponse,
	McpServerStatus as AppServerMcpServerStatus,
	McpServerToolCallParams,
	McpServerToolCallResponse,
	ListMcpServerStatusParams,
	ListMcpServerStatusResponse,
} from "../../../app-server-protocol/schema/typescript/v2";
import type { Resource } from "../../../app-server-protocol/schema/typescript/Resource";
import type { ResourceContent } from "../../../app-server-protocol/schema/typescript/ResourceContent";
import type { ResourceTemplate } from "../../../app-server-protocol/schema/typescript/ResourceTemplate";
import type { Tool } from "../../../app-server-protocol/schema/typescript/Tool";
import type { JsonValue } from "../../../app-server-protocol/schema/typescript/serde_json/JsonValue";
import {
	asThreadId,
	EmptyMcpConnectionManager,
	type McpConnectionManager,
	type McpResourceInfo,
	type McpResourceTemplateInfo,
	type McpServerStatus,
	type McpToolInfo,
	type ThreadId,
	type ThreadStore,
} from "../../../core/src";
import type { McpServerToolCallResponse as CoreMcpServerToolCallResponse } from "../../../core/src/mcp";
import type { JSONRPCErrorError } from "../outgoing_message";
import { jsonRpcError } from "./common";
import { CodexAppServerRequestError } from "./request_errors";
import {
	codexAppServerDeferredResponse,
	type CodexAppServerDeferredResponse,
	type CodexAppServerRequestContext,
} from "../message_processor";

const MCP_TOOL_THREAD_ID_META_KEY = "threadId";

export type McpRequestProcessorOptions<Context> = {
	mcpConnectionManager?: McpConnectionManager | null;
	mcpServerOauthLogin?: (input: {
		context?: Context;
		params: McpServerOauthLoginParams;
	}) => McpServerOauthLoginResponse | Promise<McpServerOauthLoginResponse>;
	reloadMcpServers?: (input: { context?: Context }) => void | Promise<void>;
	runInBackground?: (
		promise: Promise<unknown>,
		context: { context?: Context },
	) => void;
	store: ThreadStore;
};

export class McpRequestProcessor<Context> {
	constructor(private readonly options: McpRequestProcessorOptions<Context>) {}

	async mcpServerRefresh(
		_params: undefined,
		context?: Context,
	): Promise<McpServerRefreshResponse> {
		await this.options.reloadMcpServers?.({ context });
		return {};
	}

	async mcpServerStatusList(
		params: ListMcpServerStatusParams,
		context?: Context,
		request?: CodexAppServerRequestContext,
	): Promise<ListMcpServerStatusResponse | CodexAppServerDeferredResponse> {
		if (request) {
			this.runDeferred(request, context, () =>
				this.mcpServerStatusListResponse(params),
			);
			return codexAppServerDeferredResponse();
		}
		return this.mcpServerStatusListResponse(params);
	}

	private async mcpServerStatusListResponse(
		params: ListMcpServerStatusParams,
	): Promise<ListMcpServerStatusResponse> {
		const detail = params.detail ?? "full";
		const statuses = await this.manager().list_server_statuses({ detail });
		const total = statuses.length;
		const limit = Math.min(Math.max(params.limit ?? total, 1), total);
		const start = params.cursor ? parseCursor(params.cursor) : 0;
		if (start > total) {
			jsonRpcError(
				`cursor ${start} exceeds total MCP servers ${total}`,
				-32600,
				400,
			);
		}
		const end = Math.min(start + limit, total);
		return {
			data: statuses.slice(start, end).map((status) =>
				appServerMcpServerStatus(status, detail),
			),
			nextCursor: end < total ? String(end) : null,
		};
	}

	async mcpResourceRead(
		params: McpResourceReadParams,
		context?: Context,
		request?: CodexAppServerRequestContext,
	): Promise<McpResourceReadResponse | CodexAppServerDeferredResponse> {
		if (request) {
			this.runDeferred(request, context, () =>
				this.mcpResourceReadResponse(params),
			);
			return codexAppServerDeferredResponse();
		}
		return this.mcpResourceReadResponse(params);
	}

	private async mcpResourceReadResponse(
		params: McpResourceReadParams,
	): Promise<McpResourceReadResponse> {
		if (params.threadId) {
			await this.loadThread(params.threadId);
		}
		const response = await this.manager().read_resource({
			thread_id: params.threadId ? asThreadId(params.threadId) : null,
			server_name: params.server,
			uri: params.uri,
		});
		return {
			contents: response.contents.map((content) =>
				appServerResourceContent(content, params.uri),
			),
		};
	}

	async mcpServerToolCall(
		params: McpServerToolCallParams,
		context?: Context,
		request?: CodexAppServerRequestContext,
	): Promise<McpServerToolCallResponse | CodexAppServerDeferredResponse> {
		if (request) {
			this.runDeferred(request, context, () =>
				this.mcpServerToolCallResponse(params),
			);
			return codexAppServerDeferredResponse();
		}
		return this.mcpServerToolCallResponse(params);
	}

	private async mcpServerToolCallResponse(
		params: McpServerToolCallParams,
	): Promise<McpServerToolCallResponse> {
		const threadId = await this.loadThread(params.threadId);
		const response = await this.manager().call_tool({
			arguments: params.arguments,
			meta: with_mcp_tool_call_thread_id_meta(params._meta, threadId),
			server_name: params.server,
			thread_id: threadId,
			tool_name: params.tool,
		});
		return appServerMcpToolCallResponse(response);
	}

	async mcpServerOauthLogin(
		params: McpServerOauthLoginParams,
		context?: Context,
	): Promise<McpServerOauthLoginResponse> {
		if (!this.options.mcpServerOauthLogin) {
			jsonRpcError("MCP OAuth login is unavailable.", -32600, 400);
		}
		return this.options.mcpServerOauthLogin({ context, params });
	}

	private manager(): McpConnectionManager {
		return this.options.mcpConnectionManager ?? EmptyMcpConnectionManager.instance;
	}

	private runDeferred<T>(
		request: CodexAppServerRequestContext,
		context: Context | undefined,
		work: () => Promise<T>,
	): void {
		const promise = (async () => {
			try {
				await request.outgoing.sendResponse(
					request.requestId,
					await work(),
					context,
				);
			} catch (error) {
				await request.outgoing.sendError(
					request.requestId,
					jsonRpcErrorFromUnknown(error),
					context,
				);
			}
		})();
		if (this.options.runInBackground) {
			this.options.runInBackground(promise, { context });
			return;
		}
		void promise;
	}

	private async loadThread(threadIdString: string): Promise<ThreadId> {
		let threadId: ThreadId;
		try {
			threadId = asThreadId(threadIdString);
		} catch (error) {
			jsonRpcError(
				`invalid thread id: ${error instanceof Error ? error.message : String(error)}`,
				-32600,
				400,
			);
		}
		try {
			await this.options.store.readThread({
				thread_id: threadId,
				include_archived: false,
				include_history: false,
			});
		} catch {
			jsonRpcError(`thread not found: ${threadId}`, -32600, 400);
		}
		return threadId;
	}
}

function parseCursor(cursor: string): number {
	if (!/^\d+$/u.test(cursor)) {
		jsonRpcError(`invalid cursor: ${cursor}`, -32600, 400);
	}
	const parsed = Number.parseInt(cursor, 10);
	return parsed;
}

function appServerMcpServerStatus(
	status: McpServerStatus,
	detail: ListMcpServerStatusParams["detail"],
): AppServerMcpServerStatus {
	return {
		authStatus: status.authStatus ?? status.auth_status ?? "unsupported",
		name: status.name,
		resources:
			detail === "toolsAndAuthOnly"
				? []
				: (status.resources ?? []).map(appServerResource),
		resourceTemplates:
			detail === "toolsAndAuthOnly"
				? []
				: (status.resource_templates ?? []).map(appServerResourceTemplate),
		tools: Object.fromEntries(
			(status.tools ?? []).map((tool) => [tool.name, appServerTool(tool)]),
		),
	};
}

function appServerTool(tool: McpToolInfo): Tool {
	return omitUndefined({
		name: tool.name,
		title: tool.title ?? undefined,
		description: tool.description ?? undefined,
		inputSchema: (tool.input_schema ?? { type: "object" }) as JsonValue,
	});
}

function appServerResource(resource: McpResourceInfo): Resource {
	return omitUndefined({
		uri: resource.uri,
		name: resource.name ?? resource.uri,
		description: resource.description ?? undefined,
		mimeType: resource.mime_type ?? undefined,
	});
}

function appServerResourceTemplate(
	template: McpResourceTemplateInfo,
): ResourceTemplate {
	return omitUndefined({
		uriTemplate: template.uri_template,
		name: template.name ?? template.uri_template,
		title: undefined,
		description: template.description ?? undefined,
		mimeType: template.mime_type ?? undefined,
	});
}

function appServerResourceContent(
	content: unknown,
	fallbackUri: string,
): ResourceContent {
	if (!isRecord(content)) {
		return { uri: fallbackUri, text: String(content) };
	}
	const uri = typeof content.uri === "string" ? content.uri : fallbackUri;
	const mimeType =
		typeof content.mimeType === "string"
			? content.mimeType
			: typeof content.mime_type === "string"
				? content.mime_type
				: undefined;
	if (typeof content.blob === "string") {
		return omitUndefined({
			uri,
			mimeType,
			blob: content.blob,
			_meta: content._meta as JsonValue | undefined,
		});
	}
	return omitUndefined({
		uri,
		mimeType,
		text: typeof content.text === "string" ? content.text : JSON.stringify(content),
		_meta: content._meta as JsonValue | undefined,
	});
}

function appServerMcpToolCallResponse(
	response: CoreMcpServerToolCallResponse,
): McpServerToolCallResponse {
	const output = response.output;
	const record = isRecord(output) ? output : {};
	const structuredContent =
		record.structuredContent ?? record.structured_content ?? undefined;
	const isError = record.isError ?? record.is_error ?? undefined;
	return omitUndefined({
		content: Array.isArray(record.content)
			? (record.content as JsonValue[])
			: [],
		structuredContent: structuredContent as JsonValue | undefined,
		isError: typeof isError === "boolean" ? isError : undefined,
		_meta: record._meta as JsonValue | undefined,
	});
}

function with_mcp_tool_call_thread_id_meta(
	meta: JsonValue | undefined,
	threadId: ThreadId,
): unknown {
	if (meta === undefined) {
		return { [MCP_TOOL_THREAD_ID_META_KEY]: threadId };
	}
	if (isRecord(meta)) {
		return {
			...meta,
			[MCP_TOOL_THREAD_ID_META_KEY]: threadId,
		};
	}
	return meta;
}

function jsonRpcErrorFromUnknown(error: unknown): JSONRPCErrorError {
	if (error instanceof CodexAppServerRequestError) {
		return error.error;
	}
	return {
		code: -32000,
		message:
			error instanceof Error
				? error.message
				: "Codex App Server request failed.",
	};
}

function omitUndefined<T extends Record<string, unknown>>(record: T): T {
	return Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== undefined),
	) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
