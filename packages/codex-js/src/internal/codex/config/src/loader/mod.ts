import {
	CONFIG_TOML_FILE,
	type ConfigLayerEntry,
	type ConfigLayerSource,
	type ConfigLayerStack,
	type ConfigOverrides,
	type LoaderOverrides,
} from "../types";
import {
	ConfigLayerEntry_new,
	ConfigLayerEntry_new_with_raw_toml,
	ConfigLayerStack_new,
	build_cli_overrides_layer,
	merge_config_layers,
} from "../merge";
import { parse_config_toml } from "../config_toml";
import {
	NoopThreadConfigLoader,
	type ThreadConfigLoader,
	type ThreadConfigContext,
} from "../thread_config";

export type ConfigFileReader = (
	path: string,
) => Promise<string | null> | string | null;

export type LoadConfigLayersStateParams = {
	codex_home?: string;
	cwd?: string | null;
	cli_overrides?: Array<[string, unknown]>;
	overrides?: LoaderOverrides;
	thread_config_loader?: ThreadConfigLoader;
	read_file_text?: ConfigFileReader;
	app_config?: {
		file: string;
		contents: string;
	} | null;
	startup_warnings?: string[];
};

export async function load_config_layers_state(
	params: LoadConfigLayersStateParams = {},
): Promise<ConfigLayerStack> {
	const codexHome = params.codex_home ?? "";
	const readFile = params.read_file_text ?? (() => null);
	const layers: ConfigLayerEntry[] = [];

	if (params.app_config) {
		layers.push(
			load_config_toml_from_text(
				{ type: "System", file: params.app_config.file },
				params.app_config.contents,
			),
		);
	}

	if (!params.overrides?.ignore_user_config && codexHome) {
		layers.push(
			await load_config_toml_for_required_layer(readFile, {
				type: "User",
				file: `${codexHome.replace(/\/$/, "")}/${CONFIG_TOML_FILE}`,
			}),
		);
	}

	const threadConfigContext: ThreadConfigContext = {
		thread_id: null,
		cwd: params.cwd ?? null,
	};
	const threadConfigLoader =
		params.thread_config_loader ?? NoopThreadConfigLoader.instance;
	for (const layer of await threadConfigLoader.load_config_layers(
		threadConfigContext,
	)) {
		insert_layer_by_precedence(layers, layer);
	}

	const modelInstructionsFile = merge_config_layers(
		ConfigLayerStack_new(layers, params.startup_warnings ?? []),
	).model_instructions_file;
	if (modelInstructionsFile) {
		const contents = await readFile(modelInstructionsFile);
		if (contents != null) {
			layers.push(
				ConfigLayerEntry_new(
					{ type: "SessionFlags" },
					{ model_instructions_file_contents: contents },
				),
			);
		}
	}

	if (params.cli_overrides?.length) {
		layers.push(
			ConfigLayerEntry_new(
				{ type: "SessionFlags" },
				build_cli_overrides_layer(params.cli_overrides),
			),
		);
	}

	return ConfigLayerStack_new(layers, params.startup_warnings ?? []);
}

export async function load_config(
	stack: ConfigLayerStack,
	overrides: ConfigOverrides = {},
) {
	return merge_config_layers(stack, overrides);
}

export async function load_config_toml_for_required_layer(
	read_file_text: ConfigFileReader,
	name: ConfigLayerSource,
): Promise<ConfigLayerEntry> {
	const file = config_layer_source_file(name);
	const contents = file ? await read_file_text(file) : null;
	if (contents == null) {
		return ConfigLayerEntry_new(name, {});
	}
	return load_config_toml_from_text(name, contents);
}

export function load_config_toml_from_text(
	name: ConfigLayerSource,
	contents: string,
): ConfigLayerEntry {
	try {
		return ConfigLayerEntry_new_with_raw_toml(
			name,
			parse_config_toml(contents),
			contents,
		);
	} catch (error) {
		throw new Error(
			`Error parsing config file ${config_layer_source_label(name)}: ${String(error)}`,
		);
	}
}

export function insert_layer_by_precedence(
	layers: ConfigLayerEntry[],
	layer: ConfigLayerEntry,
) {
	const index = layers.findIndex(
		(existing) =>
			config_layer_source_precedence(existing.name) >
			config_layer_source_precedence(layer.name),
	);
	if (index === -1) {
		layers.push(layer);
	} else {
		layers.splice(index, 0, layer);
	}
}

function config_layer_source_precedence(source: ConfigLayerSource): number {
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

function config_layer_source_file(source: ConfigLayerSource): string | null {
	switch (source.type) {
		case "System":
		case "User":
		case "LegacyManagedConfigTomlFromFile":
			return source.file;
		case "Project":
			return `${source.dot_codex_folder.replace(/\/$/, "")}/${CONFIG_TOML_FILE}`;
		case "Mdm":
		case "SessionFlags":
		case "LegacyManagedConfigTomlFromMdm":
			return null;
	}
}

function config_layer_source_label(source: ConfigLayerSource): string {
	return config_layer_source_file(source) ?? source.type;
}
