import { AuthMode, type CodexAuth, type ProviderAccountState } from "./auth";
import { BASE_INSTRUCTIONS_DEFAULT, type Personality } from "./protocol";

export const OPENAI_PROVIDER_ID = "openai";
export const CHATGPT_CODEX_PROVIDER_ID = "chatgpt-codex";
export const OPENAI_PROVIDER_NAME = "OpenAI";
export const CHATGPT_CODEX_PROVIDER_NAME = "ChatGPT Codex";
export const OPENAI_RESPONSES_BASE_URL = "https://api.openai.com/v1";
export const CHATGPT_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";

const defaultCodexModel: string = "gpt-5.5";
const defaultCodexReasoningEffort = "medium";
const defaultRequestMaxRetries = 4;
const defaultStreamMaxRetries = 5;
const defaultStreamIdleTimeoutMs = 300_000;
const defaultWebsocketConnectTimeoutMs = 15_000;
const maxRequestMaxRetries = 100;
const maxStreamMaxRetries = 100;

export type WireApi = "responses";

export type ModelProviderAuthInfo = {
	command: string;
	args?: string[] | null;
	env?: Record<string, string> | null;
};

export type ModelProviderAwsAuthInfo = {
	profile?: string | null;
	region?: string | null;
};

export type ModelProviderInfo = {
	name: string;
	base_url?: string | null;
	env_key?: string | null;
	env_key_instructions?: string | null;
	experimental_bearer_token?: string | null;
	auth?: ModelProviderAuthInfo | null;
	aws?: ModelProviderAwsAuthInfo | null;
	wire_api?: WireApi;
	query_params?: Record<string, string> | null;
	http_headers?: Record<string, string> | null;
	env_http_headers?: Record<string, string> | null;
	request_max_retries?: number | null;
	stream_max_retries?: number | null;
	stream_idle_timeout_ms?: number | null;
	websocket_connect_timeout_ms?: number | null;
	requires_openai_auth?: boolean;
	supports_websockets?: boolean;
};

export type ProviderCapabilities = {
	namespace_tools: boolean;
	image_generation: boolean;
	web_search: boolean;
};

export type ProviderRuntimeConfig = {
	name: string;
	base_url: string;
	responses_url: string;
	query_params: Record<string, string> | null;
	headers: Record<string, string>;
	request_max_retries: number;
	stream_max_retries: number;
	stream_idle_timeout_ms: number;
	websocket_connect_timeout_ms: number;
	supports_websockets: boolean;
};

export type ModelServiceTier = {
	id: string;
	name: string;
	description: string;
};

export type ReasoningEffortOption = {
	reasoning_effort: string;
	description: string;
};

export type ModelInfo = {
	slug: string;
	display_name: string;
	description: string | null;
	default_reasoning_level: string | null;
	supported_reasoning_levels: ReasoningEffortOption[];
	visibility: "list" | "hide" | "none";
	supported_in_api: boolean;
	priority: number;
	upgrade: string | null;
	upgrade_info: null;
	availability_nux: null;
	input_modalities: string[];
	supports_personality: boolean;
	additional_speed_tiers: string[];
	service_tiers: ModelServiceTier[];
	base_instructions: string;
	model_messages?: ModelMessages | null;
	context_window?: number | null;
	max_context_window?: number | null;
	auto_compact_token_limit?: number | null;
	effective_context_window_percent?: number | null;
};

export type ModelMessages = {
	instructions_template?: string | null;
	instructions_variables?: ModelInstructionsVariables | null;
};

export type ModelInstructionsVariables = {
	personality?: Record<string, string> | null;
};

export type ModelPreset = {
	id: string;
	model: string;
	upgrade: string | null;
	upgrade_info: null;
	availability_nux: null;
	display_name: string;
	description: string;
	hidden: boolean;
	supported_reasoning_efforts: ReasoningEffortOption[];
	default_reasoning_effort: string;
	input_modalities: string[];
	supports_personality: boolean;
	additional_speed_tiers: string[];
	service_tiers: ModelServiceTier[];
	is_default: boolean;
	supported_in_api: boolean;
};

export type Model = ModelPreset;

export type ModelListParams = {
	cursor?: string | null;
	limit?: number | null;
	include_hidden?: boolean | null;
};

export type ModelListResponse = {
	data: ModelPreset[];
	next_cursor: string | null;
};

export type RefreshStrategy = "online" | "offline" | "online_if_uncached";

export type ModelsManager = {
	list_models(params?: ModelListParams): ModelListResponse;
	raw_model_catalog(refresh_strategy?: RefreshStrategy): { models: ModelInfo[] };
	get_model_info(model: string): ModelInfo;
	get_default_model(model?: string | null): string;
	default_reasoning_effort(model?: string | null): string;
};

const PERSONALITY_PLACEHOLDER = "{{ personality }}";
const DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT = 95;

export function get_model_instructions(
	model_info: ModelInfo,
	personality?: Personality | null,
): string {
	const template = model_info.model_messages?.instructions_template;
	if (template) {
		const personalityMessage =
			model_info.model_messages?.instructions_variables?.personality?.[
				personality ?? ""
			] ?? "";
		return template.replace(PERSONALITY_PLACEHOLDER, personalityMessage);
	}
	return model_info.base_instructions || BASE_INSTRUCTIONS_DEFAULT;
}

export function resolvedContextWindow(modelInfo: ModelInfo): number | null {
	return finitePositiveInteger(modelInfo.context_window) ??
		finitePositiveInteger(modelInfo.max_context_window) ??
		null;
}

export function effectiveContextWindow(modelInfo: ModelInfo): number | null {
	const contextWindow = resolvedContextWindow(modelInfo);
	if (contextWindow === null) {
		return null;
	}
	const percent =
		finitePositiveInteger(modelInfo.effective_context_window_percent) ??
		DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT;
	return Math.trunc((contextWindow * percent) / 100);
}

export function autoCompactTokenLimit(modelInfo: ModelInfo): number | null {
	const contextWindow = resolvedContextWindow(modelInfo);
	const configuredLimit = finitePositiveInteger(modelInfo.auto_compact_token_limit);
	if (contextWindow === null) {
		return configuredLimit;
	}
	const contextLimit = Math.trunc((contextWindow * 9) / 10);
	return configuredLimit === null ? contextLimit : Math.min(configuredLimit, contextLimit);
}

export type ModelProvider = {
	info(): ModelProviderInfo;
	account_state(): ProviderAccountState;
	capabilities(): ProviderCapabilities;
	runtime_config(auth?: CodexAuth | null): ProviderRuntimeConfig;
	models_manager(): ModelsManager;
};

const reasoningOptions: ReasoningEffortOption[] = [
	{ reasoning_effort: "low", description: "Fast responses with lighter reasoning." },
	{ reasoning_effort: "medium", description: "Balanced speed and reasoning depth." },
	{ reasoning_effort: "high", description: "Deeper reasoning for complex planning." },
	{ reasoning_effort: "xhigh", description: "Maximum reasoning depth for hard tasks." },
];

export const defaultProviderCapabilities: ProviderCapabilities = {
	namespace_tools: true,
	image_generation: true,
	web_search: true,
};

export function createOpenAiModelProviderInfo(
	base_url: string | null = null,
): ModelProviderInfo {
	return {
		name: OPENAI_PROVIDER_NAME,
		base_url,
		env_key: null,
		env_key_instructions: null,
		experimental_bearer_token: null,
		auth: null,
		aws: null,
		wire_api: "responses",
		query_params: null,
		http_headers: { version: "codex-assistant" },
		env_http_headers: {
			"OpenAI-Organization": "OPENAI_ORGANIZATION",
			"OpenAI-Project": "OPENAI_PROJECT",
		},
		request_max_retries: null,
		stream_max_retries: null,
		stream_idle_timeout_ms: null,
		websocket_connect_timeout_ms: null,
		requires_openai_auth: true,
		supports_websockets: true,
	};
}

export function createChatgptCodexModelProviderInfo(): ModelProviderInfo {
	return {
		...createOpenAiModelProviderInfo(CHATGPT_CODEX_BASE_URL),
		name: CHATGPT_CODEX_PROVIDER_NAME,
		supports_websockets: false,
	};
}

export function validateModelProviderInfo(provider: ModelProviderInfo): void {
	const wireApi = (provider as { wire_api?: unknown }).wire_api ?? "responses";
	if (wireApi === "chat") {
		throw new Error(
			'`wire_api = "chat"` is no longer supported. Set `wire_api = "responses"`.',
		);
	}
	if (wireApi !== "responses") {
		throw new Error(`unknown wire_api: ${String(wireApi)}`);
	}
	if (provider.aws) {
		const conflicts = conflictFields(provider, [
			"env_key",
			"experimental_bearer_token",
			"auth",
			"requires_openai_auth",
		]);
		if (provider.supports_websockets) {
			conflicts.push("supports_websockets");
		}
		if (conflicts.length > 0) {
			throw new Error(`provider aws cannot be combined with ${conflicts.join(", ")}`);
		}
	}
	if (provider.auth) {
		if (!provider.auth.command.trim()) {
			throw new Error("provider auth.command must not be empty");
		}
		const conflicts = conflictFields(provider, [
			"env_key",
			"experimental_bearer_token",
			"requires_openai_auth",
		]);
		if (conflicts.length > 0) {
			throw new Error(`provider auth cannot be combined with ${conflicts.join(", ")}`);
		}
	}
}

export class ConfiguredModelProvider implements ModelProvider {
	private readonly providerInfo: ModelProviderInfo;
	private readonly accountState: ProviderAccountState;
	private readonly providerCapabilities: ProviderCapabilities;
	private readonly manager: ModelsManager;

	constructor(input: {
		info: ModelProviderInfo;
		account_state?: ProviderAccountState;
		capabilities?: ProviderCapabilities;
		models_manager?: ModelsManager;
	}) {
		validateModelProviderInfo(input.info);
		this.providerInfo = { ...input.info, wire_api: input.info.wire_api ?? "responses" };
		this.accountState =
			input.account_state ??
			({
				account: null,
				requires_openai_auth: this.providerInfo.requires_openai_auth ?? false,
			} satisfies ProviderAccountState);
		this.providerCapabilities = input.capabilities ?? defaultProviderCapabilities;
		this.manager = input.models_manager ?? new StaticModelsManager();
	}

	info(): ModelProviderInfo {
		return this.providerInfo;
	}

	account_state(): ProviderAccountState {
		return this.accountState;
	}

	capabilities(): ProviderCapabilities {
		return this.providerCapabilities;
	}

	runtime_config(auth?: CodexAuth | null): ProviderRuntimeConfig {
		return providerRuntimeConfig(this.providerInfo, auth ?? null);
	}

	models_manager(): ModelsManager {
		return this.manager;
	}
}

export class StaticModelsManager implements ModelsManager {
	private readonly models: ModelInfo[];

	constructor(models: ModelInfo[] = defaultCodexModelInfo()) {
		this.models = [...models];
	}

	list_models(params: ModelListParams = {}): ModelListResponse {
		const presets = this.build_available_models();
		const visible = params.include_hidden
			? presets
			: presets.filter((model) => !model.hidden);
		const total = visible.length;
		const limit = Math.max(1, Math.min(total || 1, params.limit ?? (total || 1)));
		const start = params.cursor ? Number.parseInt(params.cursor, 10) : 0;

		if (!Number.isInteger(start) || start < 0 || start > total) {
			throw new Error(`invalid cursor: ${params.cursor}`);
		}

		const end = Math.min(total, start + limit);
		return {
			data: visible.slice(start, end),
			next_cursor: end < total ? String(end) : null,
		};
	}

	raw_model_catalog(): { models: ModelInfo[] } {
		return { models: [...this.models] };
	}

	get_model_info(model: string): ModelInfo {
		return (
			findModelByLongestPrefix(model, this.models) ??
			findModelByNamespacedSuffix(model, this.models) ??
			modelInfoFromSlug(model)
		);
	}

	get_default_model(model?: string | null): string {
		if (model) {
			return model;
		}
		const selected = this.build_available_models().find((preset) => preset.is_default);
		return selected?.model ?? this.build_available_models()[0]?.model ?? defaultCodexModel;
	}

	default_reasoning_effort(model?: string | null): string {
		const info = this.get_model_info(this.get_default_model(model));
		return info.default_reasoning_level ?? defaultCodexReasoningEffort;
	}

	private build_available_models(): ModelPreset[] {
		const sorted = [...this.models].sort((left, right) => left.priority - right.priority);
		const presets = sorted.map(modelInfoToPreset);
		markDefaultByPickerVisibility(presets);
		return presets;
	}
}

export function createModelProvider(input: {
	info?: ModelProviderInfo;
	auth?: CodexAuth | null;
	account_state?: ProviderAccountState;
	capabilities?: ProviderCapabilities;
	models_manager?: ModelsManager;
} = {}): ModelProvider {
	return new ConfiguredModelProvider({
		info: input.info ?? createOpenAiModelProviderInfo(),
		account_state:
			input.account_state ??
			codexAuthToProviderAccountState(input.auth ?? null, true),
		capabilities: input.capabilities,
		models_manager: input.models_manager,
	});
}

export function defaultModelsManager(): ModelsManager {
	return new StaticModelsManager();
}

export function listDefaultCodexModels(
	params: ModelListParams = {},
): ModelListResponse {
	return defaultModelsManager().list_models(params);
}

export function defaultCodexModels(): Model[] {
	return listDefaultCodexModels({ include_hidden: true }).data;
}

export function defaultCodexModelInfo(): ModelInfo[] {
	return [
		{
			slug: "gpt-5.5",
			display_name: "GPT-5.5",
			description: "Frontier model for complex planning and implementation.",
			default_reasoning_level: defaultCodexReasoningEffort,
			supported_reasoning_levels: reasoningOptions,
			visibility: "list",
			supported_in_api: true,
			priority: 0,
			upgrade: null,
			upgrade_info: null,
			availability_nux: null,
			input_modalities: ["text", "image"],
			supports_personality: true,
			additional_speed_tiers: [],
			service_tiers: [],
			base_instructions: BASE_INSTRUCTIONS_DEFAULT,
			model_messages: null,
			context_window: 272_000,
			max_context_window: null,
			auto_compact_token_limit: null,
			effective_context_window_percent: DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT,
		},
		{
			slug: "gpt-5.4",
			display_name: "GPT-5.4",
			description: "Strong everyday model for coding and product work.",
			default_reasoning_level: defaultCodexReasoningEffort,
			supported_reasoning_levels: reasoningOptions,
			visibility: "list",
			supported_in_api: true,
			priority: 1,
			upgrade: null,
			upgrade_info: null,
			availability_nux: null,
			input_modalities: ["text", "image"],
			supports_personality: true,
			additional_speed_tiers: [],
			service_tiers: [],
			base_instructions: BASE_INSTRUCTIONS_DEFAULT,
			model_messages: null,
			context_window: 272_000,
			max_context_window: null,
			auto_compact_token_limit: null,
			effective_context_window_percent: DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT,
		},
		{
			slug: "gpt-5.4-mini",
			display_name: "GPT-5.4 Mini",
			description: "Faster, smaller model for simple chat and iteration.",
			default_reasoning_level: defaultCodexReasoningEffort,
			supported_reasoning_levels: reasoningOptions.filter(
				(option) => option.reasoning_effort !== "xhigh",
			),
			visibility: "list",
			supported_in_api: true,
			priority: 2,
			upgrade: null,
			upgrade_info: null,
			availability_nux: null,
			input_modalities: ["text", "image"],
			supports_personality: true,
			additional_speed_tiers: [],
			service_tiers: [],
			base_instructions: BASE_INSTRUCTIONS_DEFAULT,
			model_messages: null,
			context_window: 128_000,
			max_context_window: null,
			auto_compact_token_limit: null,
			effective_context_window_percent: DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT,
		},
	];
}

export function defaultModelProviderAccountState(): ProviderAccountState {
	return {
		account: null,
		requires_openai_auth: true,
	};
}

export function apiKeyProviderAccountState(): ProviderAccountState {
	return {
		account: { type: AuthMode.ApiKey },
		requires_openai_auth: true,
	};
}

export function providerRuntimeConfig(
	provider: ModelProviderInfo,
	auth: CodexAuth | null,
): ProviderRuntimeConfig {
	validateModelProviderInfo(provider);
	const baseUrl =
		provider.base_url ??
		(auth?.type === AuthMode.Chatgpt
			? CHATGPT_CODEX_BASE_URL
			: OPENAI_RESPONSES_BASE_URL);
	const headers = {
		...(provider.http_headers ?? {}),
	};
	return {
		name: provider.name,
		base_url: baseUrl,
		responses_url: `${baseUrl.replace(/\/$/, "")}/responses`,
		query_params: provider.query_params ?? null,
		headers,
		request_max_retries: clampRetry(
			provider.request_max_retries,
			defaultRequestMaxRetries,
			maxRequestMaxRetries,
		),
		stream_max_retries: clampRetry(
			provider.stream_max_retries,
			defaultStreamMaxRetries,
			maxStreamMaxRetries,
		),
		stream_idle_timeout_ms:
			provider.stream_idle_timeout_ms ?? defaultStreamIdleTimeoutMs,
		websocket_connect_timeout_ms:
			provider.websocket_connect_timeout_ms ?? defaultWebsocketConnectTimeoutMs,
		supports_websockets: provider.supports_websockets ?? false,
	};
}

export function modelInfoToPreset(info: ModelInfo): ModelPreset {
	return {
		id: info.slug,
		model: info.slug,
		upgrade: info.upgrade,
		upgrade_info: info.upgrade_info,
		availability_nux: info.availability_nux,
		display_name: info.display_name,
		description: info.description ?? info.display_name,
		hidden: info.visibility !== "list",
		supported_reasoning_efforts: info.supported_reasoning_levels,
		default_reasoning_effort:
			info.default_reasoning_level ?? defaultCodexReasoningEffort,
		input_modalities: info.input_modalities,
		supports_personality: info.supports_personality,
		additional_speed_tiers: info.additional_speed_tiers,
		service_tiers: info.service_tiers,
		is_default: false,
		supported_in_api: info.supported_in_api,
	};
}

export function modelInfoFromSlug(slug: string): ModelInfo {
	const known = defaultCodexModelInfo().find((model) => model.slug === slug);
	if (known) {
		return known;
	}
	return {
		slug,
		display_name: slug,
		description: null,
		default_reasoning_level: defaultCodexReasoningEffort,
		supported_reasoning_levels: reasoningOptions,
		visibility: "none",
		supported_in_api: true,
		priority: 99,
		upgrade: null,
		upgrade_info: null,
		availability_nux: null,
		input_modalities: ["text", "image"],
		supports_personality: false,
		additional_speed_tiers: [],
		service_tiers: [],
		base_instructions: BASE_INSTRUCTIONS_DEFAULT,
		model_messages: null,
		context_window: null,
		max_context_window: null,
		auto_compact_token_limit: null,
		effective_context_window_percent: DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT,
	};
}

export function isReasoningEffortSupported(
	model: string,
	effort: string | null | undefined,
	manager: ModelsManager = defaultModelsManager(),
): boolean {
	if (!effort) {
		return false;
	}
	return manager
		.get_model_info(model)
		.supported_reasoning_levels.some((option) => option.reasoning_effort === effort);
}

export function resolveReasoningEffortForModel(
	model: string,
	effort: string | null | undefined,
	manager: ModelsManager = defaultModelsManager(),
): string {
	return isReasoningEffortSupported(model, effort, manager)
		? effort!
		: manager.default_reasoning_effort(model);
}

function codexAuthToProviderAccountState(
	auth: CodexAuth | null,
	requiresOpenAiAuth: boolean,
): ProviderAccountState {
	if (!auth) {
		return { account: null, requires_openai_auth: requiresOpenAiAuth };
	}
	if (auth.type === AuthMode.ApiKey) {
		return apiKeyProviderAccountState();
	}
	const email = auth.email;
	const planType = auth.plan_type;
	return {
		account:
			email && planType
				? { type: AuthMode.Chatgpt, email, plan_type: planType }
				: null,
		requires_openai_auth: requiresOpenAiAuth,
	};
}

function conflictFields(
	provider: ModelProviderInfo,
	fields: Array<keyof ModelProviderInfo>,
): string[] {
	return fields.filter((field) => {
		const value = provider[field];
		return value !== undefined && value !== null && value !== false;
	});
}

function clampRetry(value: number | null | undefined, fallback: number, max: number): number {
	return Math.min(Math.max(0, value ?? fallback), max);
}

function markDefaultByPickerVisibility(presets: ModelPreset[]): void {
	for (const preset of presets) {
		preset.is_default = false;
	}
	const visibleDefault =
		presets.find((preset) => preset.model === defaultCodexModel && !preset.hidden) ??
		presets.find((preset) => !preset.hidden) ??
		presets[0];
	if (visibleDefault) {
		visibleDefault.is_default = true;
	}
}

function findModelByLongestPrefix(
	model: string,
	candidates: readonly ModelInfo[],
): ModelInfo | null {
	let best: ModelInfo | null = null;
	for (const candidate of candidates) {
		if (!model.startsWith(candidate.slug)) {
			continue;
		}
		if (!best || candidate.slug.length > best.slug.length) {
			best = candidate;
		}
	}
	return best;
}

function findModelByNamespacedSuffix(
	model: string,
	candidates: readonly ModelInfo[],
): ModelInfo | null {
	const [namespace, suffix, extra] = model.split("/");
	if (!namespace || !suffix || extra) {
		return null;
	}
	if (!/^[A-Za-z0-9_-]+$/.test(namespace)) {
		return null;
	}
	return findModelByLongestPrefix(suffix, candidates);
}

function finitePositiveInteger(value: number | null | undefined): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return null;
	}
	return Math.trunc(value);
}
