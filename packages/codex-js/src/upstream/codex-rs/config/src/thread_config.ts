import type { ThreadId } from "../../core/src/ids";
import type { ConfigLayerEntry, ConfigToml } from "./types";
import { ConfigLayerEntry_new } from "./merge";

export type ThreadConfigContext = {
	thread_id: ThreadId | null;
	cwd: string | null;
};

export type SessionThreadConfig = ConfigToml & {
	model_provider?: string;
	model_providers?: Record<string, unknown>;
	features?: Record<string, unknown>;
};

export type UserThreadConfig = ConfigToml;

export type ThreadConfigSource =
	| {
			type: "Session";
			config: SessionThreadConfig;
	  }
	| {
			type: "User";
			config: UserThreadConfig;
	  };

export type ThreadConfigLoadErrorCode =
	| "Auth"
	| "Timeout"
	| "Parse"
	| "RequestFailed"
	| "Internal";

export class ThreadConfigLoadError extends Error {
	constructor(
		readonly code: ThreadConfigLoadErrorCode,
		message: string,
		readonly status_code: number | null = null,
	) {
		super(message);
		this.name = "ThreadConfigLoadError";
	}
}

export interface ThreadConfigLoader {
	load(
		context: ThreadConfigContext,
	): Promise<ThreadConfigSource[]> | ThreadConfigSource[];
	load_config_layers(
		context: ThreadConfigContext,
	): Promise<ConfigLayerEntry[]> | ConfigLayerEntry[];
}

export abstract class BaseThreadConfigLoader implements ThreadConfigLoader {
	abstract load(
		context: ThreadConfigContext,
	): Promise<ThreadConfigSource[]> | ThreadConfigSource[];

	async load_config_layers(
		context: ThreadConfigContext,
	): Promise<ConfigLayerEntry[]> {
		const sources = await this.load(context);
		return sources
			.map(thread_config_source_to_layer)
			.filter((layer): layer is ConfigLayerEntry => Boolean(layer));
	}
}

export class StaticThreadConfigLoader extends BaseThreadConfigLoader {
	constructor(private readonly sources: ThreadConfigSource[] = []) {
		super();
	}

	load(context: ThreadConfigContext): ThreadConfigSource[] {
		void context;
		return this.sources;
	}
}

export class NoopThreadConfigLoader extends BaseThreadConfigLoader {
	static readonly instance = new NoopThreadConfigLoader();

	load(context: ThreadConfigContext): ThreadConfigSource[] {
		void context;
		return [];
	}
}

export function thread_config_source_to_layer(
	source: ThreadConfigSource,
): ConfigLayerEntry | null {
	switch (source.type) {
		case "Session":
			return is_empty_config(source.config)
				? null
				: ConfigLayerEntry_new({ type: "SessionFlags" }, source.config);
		case "User":
			return is_empty_config(source.config)
				? null
				: ConfigLayerEntry_new(
						{ type: "User", file: "$CODEX_HOME/config.toml" },
						source.config,
					);
	}
}

function is_empty_config(config: ConfigToml): boolean {
	return Object.keys(config).length === 0;
}
