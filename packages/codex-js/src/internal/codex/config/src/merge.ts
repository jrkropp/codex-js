import type {
	ConfigLayerEntry,
	ConfigLayerSource,
	ConfigLayerStack,
	ConfigLayerStackOrdering,
	ConfigOverrides,
	ConfigToml,
	ResolvedConfig,
	ToolsToml,
} from "./types";
import { ConfigLayerStackOrdering as ConfigLayerStackOrderingValue } from "./types";
import {
	activePermissionProfileForBuiltin,
	builtinPermissionProfileNameFromProfile,
	defaultBuiltinPermissionProfileName,
	effectivePermissionProfile,
	legacySandboxPolicyFromPermissionProfile,
	permissionProfileFromLegacySandboxPolicy,
	validatePermissionProfile,
} from "../../core/src/config/permissions";
import { normalizeCollaborationMode } from "../../core/src/collaboration-mode-presets";
import type { PermissionProfile } from "../../core/src/protocol";
import { BaseInstructions } from "../../core/src/protocol";
import {
	defaultToolsConfig,
	type DefaultToolsConfigInput,
	type WebSearchConfig,
	type WebSearchMode,
} from "../../core/src/tools/spec_plan_types";
import type {
	WebSearchLocation,
	WebSearchToolConfig,
} from "../../app-server-protocol/schema/typescript";

const PROJECT_LOCAL_CONFIG_DENYLIST = new Set([
	"openai_base_url",
	"chatgpt_base_url",
	"model_provider",
	"model_providers",
	"notify",
	"profile",
	"profiles",
	"experimental_realtime_ws_base_url",
]);

export function config_layer_source_precedence(
	source: ConfigLayerSource,
): number {
	switch (source.type) {
		case "Mdm":
			return 0;
		case "System":
			return 10;
		case "User":
			return 20;
		case "Project":
			return 25;
		case "SessionFlags":
			return 30;
		case "LegacyManagedConfigTomlFromFile":
			return 40;
		case "LegacyManagedConfigTomlFromMdm":
			return 50;
	}
}

export function ConfigLayerEntry_new(
	name: ConfigLayerSource,
	config: ConfigToml,
): ConfigLayerEntry {
	return {
		name,
		config: sanitize_config_for_layer(name, config),
		raw_toml: null,
		version: version_for_toml(config),
		disabled_reason: null,
	};
}

export function ConfigLayerEntry_new_with_raw_toml(
	name: ConfigLayerSource,
	config: ConfigToml,
	raw_toml: string,
): ConfigLayerEntry {
	const sanitized = sanitize_config_for_layer(name, config);
	return {
		name,
		config: sanitized,
		raw_toml,
		version: version_for_toml(sanitized),
		disabled_reason: null,
	};
}

export function ConfigLayerEntry_new_disabled(
	name: ConfigLayerSource,
	config: ConfigToml,
	disabled_reason: string,
): ConfigLayerEntry {
	return {
		name,
		config,
		raw_toml: null,
		version: version_for_toml(config),
		disabled_reason,
	};
}

export function ConfigLayerEntry_is_disabled(layer: ConfigLayerEntry): boolean {
	return Boolean(layer.disabled_reason);
}

export function ConfigLayerStack_new(
	layers: ConfigLayerEntry[] = [],
	startup_warnings: string[] = [],
): ConfigLayerStack {
	verify_layer_ordering(layers);
	return { layers, startup_warnings };
}

export function ConfigLayerStack_get_layers(
	stack: ConfigLayerStack,
	ordering: ConfigLayerStackOrdering,
	include_disabled = false,
): ConfigLayerEntry[] {
	const layers = stack.layers.filter(
		(layer) => include_disabled || !ConfigLayerEntry_is_disabled(layer),
	);
	return ordering === ConfigLayerStackOrderingValue.HighestPrecedenceFirst
		? [...layers].reverse()
		: layers;
}

export function ConfigLayerStack_effective_config(
	stack: ConfigLayerStack,
): ConfigToml {
	const merged: ConfigToml = {};
	for (const layer of ConfigLayerStack_get_layers(
		stack,
		ConfigLayerStackOrderingValue.LowestPrecedenceFirst,
		false,
	)) {
		merge_toml_values(merged, layer.config);
	}
	return merged;
}

export function merge_config_layers(
	stack: ConfigLayerStack,
	overrides: ConfigOverrides = {},
): ResolvedConfig {
	const merged = ConfigLayerStack_effective_config(stack);
	return resolve_config(merged, stack.startup_warnings, overrides);
}

export function merge_toml_values(
	base: ConfigToml,
	overlay: ConfigToml,
): ConfigToml {
	merge_toml_values_at_path(base, overlay, []);
	return base;
}

function merge_toml_values_at_path(
	base: Record<string, unknown>,
	overlay: Record<string, unknown>,
	path: string[],
) {
	normalize_key_aliases(path, base);
	const normalizedOverlay = { ...overlay };
	normalize_key_aliases(path, normalizedOverlay);

	for (const [key, value] of Object.entries(normalizedOverlay)) {
		const existing = base[key];
		const childPath = [...path, key];
		if (isIgnoredLegacyToolsWebSearchValue(childPath, value)) {
			continue;
		}
		if (isPlainTomlTable(existing) && isPlainTomlTable(value)) {
			merge_toml_values_at_path(existing, value, childPath);
		} else {
			base[key] = normalized_with_key_aliases(value, childPath);
		}
	}
}

export function resolve_config(
	config: ConfigToml,
	startupWarnings: string[] = [],
	overrides: ConfigOverrides = {},
): ResolvedConfig {
	const merged: ConfigToml = { ...config };
	const activeProfileName = overrides.profile ?? merged.profile ?? null;
	const configProfile =
		activeProfileName && merged.profiles
			? merged.profiles[activeProfileName]
			: null;
	if (activeProfileName && !configProfile) {
		startupWarnings = [
			...startupWarnings,
			`config profile \`${activeProfileName}\` not found`,
		];
	}
	if (configProfile) {
		merge_toml_values(merged, configProfile);
	}
	merge_toml_values(merged, overrides);

	const permissionProfile = resolvePermissionProfile(merged);
	const permissionWarnings = validatePermissionProfile(permissionProfile);
	const sandboxPolicy =
		merged.sandbox_policy ??
		legacySandboxPolicyFromPermissionProfile(permissionProfile, merged.cwd ?? "");
	const activeBuiltin = builtinPermissionProfileNameFromProfile(
		permissionProfile,
	) ?? defaultBuiltinPermissionProfileName();
	const baseInstructions = normalizeBaseInstructions(merged);
	const webSearchMode = resolve_web_search_mode(merged) ?? "cached";
	const webSearchConfig = resolve_web_search_config(merged);
	const tools = tools_config_from_toml(merged.tools, {
		web_search_config: webSearchConfig,
		web_search_mode: webSearchMode,
	});

	return {
		model: merged.model ?? "gpt-5.5",
		model_provider: merged.model_provider ?? "openai",
		service_tier: merged.service_tier ?? null,
		reasoning_effort: merged.model_reasoning_effort ?? null,
		reasoning_summary: merged.model_reasoning_summary ?? "auto",
		personality: merged.personality ?? null,
		approval_policy: merged.approval_policy ?? "never",
		approvals_reviewer: merged.approvals_reviewer ?? null,
		sandbox_policy: sandboxPolicy,
		permission_profile: permissionProfile,
		active_permission_profile:
			merged.active_permission_profile ??
			activePermissionProfileForBuiltin(activeBuiltin),
		windows_sandbox_level: merged.windows_sandbox_level ?? null,
		cwd: merged.cwd ?? "",
		base_instructions: baseInstructions.base_instructions,
		base_instructions_source: baseInstructions.source,
		developer_instructions: merged.developer_instructions ?? null,
		user_instructions: merged.user_instructions ?? null,
			collaboration_mode: normalizeCollaborationMode({
				collaborationMode: merged.collaboration_mode ?? null,
				model: merged.model ?? "gpt-5.5",
				reasoningEffort: merged.model_reasoning_effort ?? null,
			}),
		session_source: merged.session_source ?? "test",
		environments: merged.environments ?? [],
		dynamic_tools: merged.dynamic_tools ?? [],
		final_output_json_schema: merged.final_output_json_schema,
		truncation_policy: merged.truncation_policy ?? null,
		web_search: merged.web_search ?? null,
		web_search_mode: webSearchMode,
		tools,
		profiles: merged.profiles,
		profile: merged.profile,
		compact_prompt: merged.compact_prompt ?? null,
		include_permissions_instructions:
			merged.include_permissions_instructions ?? true,
		include_environment_context: merged.include_environment_context ?? true,
		include_apps_instructions: merged.include_apps_instructions ?? true,
		include_skill_instructions: merged.include_skill_instructions ?? true,
		startup_warnings: [...startupWarnings, ...permissionWarnings],
		model_reasoning_effort: merged.model_reasoning_effort,
		model_reasoning_summary: merged.model_reasoning_summary,
	};
}

export function resolve_web_search_mode(
	config: Pick<ConfigToml, "features" | "web_search">,
): WebSearchMode | null {
	if (isWebSearchMode(config.web_search)) {
		return config.web_search;
	}
	if (featureEnabled(config.features, "web_search_cached", "WebSearchCached")) {
		return "cached";
	}
	if (featureEnabled(config.features, "web_search_request", "WebSearchRequest")) {
		return "live";
	}
	return null;
}

export function resolve_web_search_config(
	config: Pick<ConfigToml, "tools">,
): WebSearchConfig | null {
	const toolConfig = normalizeWebSearchToolConfig(config.tools?.web_search);
	return toolConfig ? webSearchConfigFromToolConfig(toolConfig) : null;
}

export function resolve_web_search_mode_for_turn(input: {
	allowed_modes?: readonly WebSearchMode[] | null;
	permission_profile?: PermissionProfile | null;
	web_search_mode: WebSearchMode;
}): WebSearchMode {
	const allowed = allowedWebSearchModes(input.allowed_modes);
	const preferred = input.web_search_mode;
	if (isDisabledPermissionProfile(input.permission_profile) && preferred !== "disabled") {
		for (const mode of ["live", "cached", "disabled"] as const) {
			if (allowed.has(mode)) {
				return mode;
			}
		}
		return "disabled";
	}
	if (allowed.has(preferred)) {
		return preferred;
	}
	for (const mode of ["cached", "live", "disabled"] as const) {
		if (allowed.has(mode)) {
			return mode;
		}
	}
	return "disabled";
}

function tools_config_from_toml(
	tools: ToolsToml | null | undefined,
	webSearch: {
		web_search_config: WebSearchConfig | null;
		web_search_mode: WebSearchMode;
	},
) {
	const input: DefaultToolsConfigInput = { ...(tools ?? {}) } as DefaultToolsConfigInput;
	delete (input as Record<string, unknown>).web_search;
	return defaultToolsConfig({
		...input,
		web_search_config: webSearch.web_search_config,
		web_search_mode: webSearch.web_search_mode,
	});
}

function normalizeWebSearchToolConfig(
	value: ToolsToml["web_search"] | undefined,
): Partial<WebSearchToolConfig> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value;
}

function webSearchConfigFromToolConfig(
	config: Partial<WebSearchToolConfig>,
): WebSearchConfig {
	return {
		...(Array.isArray(config.allowed_domains)
			? { filters: { allowed_domains: config.allowed_domains } }
			: {}),
		...(config.location && typeof config.location === "object"
			? { user_location: webSearchUserLocation(config.location) }
			: {}),
		...(config.context_size
			? { search_context_size: config.context_size }
			: {}),
	};
}

function webSearchUserLocation(location: WebSearchLocation) {
	return {
		type: "approximate",
		...(location.country ? { country: location.country } : {}),
		...(location.region ? { region: location.region } : {}),
		...(location.city ? { city: location.city } : {}),
		...(location.timezone ? { timezone: location.timezone } : {}),
	};
}

function allowedWebSearchModes(
	modes: readonly WebSearchMode[] | null | undefined,
): Set<WebSearchMode> {
	if (!modes) {
		return new Set(["disabled", "cached", "live"]);
	}
	return new Set<WebSearchMode>(["disabled", ...modes.filter(isWebSearchMode)]);
}

function isWebSearchMode(value: unknown): value is WebSearchMode {
	return value === "disabled" || value === "cached" || value === "live";
}

function isDisabledPermissionProfile(
	profile: PermissionProfile | null | undefined,
): boolean {
	return Boolean(profile && (profile as { type?: unknown }).type === "disabled");
}

function featureEnabled(
	features: ConfigToml["features"] | undefined,
	...keys: string[]
): boolean {
	if (!features) {
		return false;
	}
	for (const key of keys) {
		const value = features[key];
		if (value === true) {
			return true;
		}
		if (value && typeof value === "object") {
			const record = value as Record<string, unknown>;
			if (record.enabled === true || record.value === true) {
				return true;
			}
		}
	}
	return false;
}

function normalizeBaseInstructions(config: ConfigToml) {
	if (typeof config.instructions === "string") {
		return {
			base_instructions: { text: config.instructions },
			source: "config" as const,
		};
	}
	if (typeof config.model_instructions_file_contents === "string") {
		const trimmed = config.model_instructions_file_contents.trim();
		if (trimmed) {
			return {
				base_instructions: { text: trimmed },
				source: "model_instructions_file" as const,
			};
		}
	}
	const baseInstructions = config.base_instructions;
	if (typeof baseInstructions === "string") {
		return {
			base_instructions: { text: baseInstructions },
			source: "config" as const,
		};
	}
	if (baseInstructions) {
		return {
			base_instructions: baseInstructions,
			source: "config" as const,
		};
	}
	return {
		base_instructions: BaseInstructions.default(),
		source: "default" as const,
	};
}

function resolvePermissionProfile(config: ConfigToml) {
	if (config.permission_profile) {
		return effectivePermissionProfile({
			permission_profile: config.permission_profile,
			sandbox_policy: config.sandbox_policy,
		});
	}
	if (config.sandbox_policy) {
		return effectivePermissionProfile({
			permission_profile: null,
			sandbox_policy: config.sandbox_policy,
		});
	}
	if (config.sandbox_mode) {
		return permissionProfileFromLegacySandboxPolicy({
			mode: config.sandbox_mode,
		});
	}
	return effectivePermissionProfile({
		permission_profile: null,
		sandbox_policy: null,
	});
}

function sanitize_config_for_layer(
	source: ConfigLayerSource,
	config: ConfigToml,
): ConfigToml {
	if (source.type !== "Project") {
		return config;
	}
	const sanitized = { ...config };
	for (const denied of PROJECT_LOCAL_CONFIG_DENYLIST) {
		delete (sanitized as Record<string, unknown>)[denied];
	}
	return sanitized;
}

function verify_layer_ordering(layers: ConfigLayerEntry[]) {
	for (let index = 1; index < layers.length; index += 1) {
		const previous = layers[index - 1];
		const current = layers[index];
		if (
			config_layer_source_precedence(previous.name) >
			config_layer_source_precedence(current.name)
		) {
			throw new Error("config layers are not in correct precedence order");
		}
	}
}

function version_for_toml(config: ConfigToml): string {
	return stableStringify(config);
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	if (isPlainTomlTable(value)) {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function isPlainTomlTable(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalize_key_aliases(
	path: string[],
	table: Record<string, unknown>,
) {
	if (
		path.length === 1 &&
		path[0] === "memories" &&
		"no_memories_if_mcp_or_web_search" in table &&
		!("disable_on_external_context" in table)
	) {
		table.disable_on_external_context =
			table.no_memories_if_mcp_or_web_search;
		delete table.no_memories_if_mcp_or_web_search;
	}
}

function normalized_with_key_aliases(value: unknown, path: string[]): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => normalized_with_key_aliases(item, path));
	}
	if (!isPlainTomlTable(value)) {
		return value;
	}
	const normalized: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		normalized[key] = normalized_with_key_aliases(child, [...path, key]);
	}
	normalize_key_aliases(path, normalized);
	return normalized;
}

function isIgnoredLegacyToolsWebSearchValue(
	path: string[],
	value: unknown,
): boolean {
	return path.length === 2 && path[0] === "tools" && path[1] === "web_search" && typeof value === "boolean";
}

export function build_cli_overrides_layer(
	cli_overrides: Array<[string, unknown]>,
): ConfigToml {
	const root: ConfigToml = {};
	for (const [path, value] of cli_overrides) {
		apply_toml_override(root, path, value);
	}
	return root;
}

function apply_toml_override(root: ConfigToml, path: string, value: unknown) {
	let current: Record<string, unknown> = root;
	const segments = path.split(".");
	for (const [index, segment] of segments.entries()) {
		if (index === segments.length - 1) {
			current[segment] = value;
			return;
		}
		const next = current[segment];
		if (!isPlainTomlTable(next)) {
			current[segment] = {};
		}
		current = current[segment] as Record<string, unknown>;
	}
}
