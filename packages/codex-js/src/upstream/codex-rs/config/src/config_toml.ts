import { parse, stringify } from "smol-toml";
import type { ConfigToml } from "./types";

export type { ConfigToml } from "./types";

export type TomlValue =
	| string
	| number
	| bigint
	| boolean
	| null
	| TomlValue[]
	| { [key: string]: TomlValue };

export type TomlTable = { [key: string]: TomlValue };

export function parse_config_toml(contents: string): ConfigToml {
	return parse(contents) as ConfigToml;
}

export function parse_toml_value(contents: string): TomlTable {
	return parse(contents) as TomlTable;
}

export function serialize_config_toml(config: ConfigToml): string {
	return stringify(config as TomlTable);
}

export function empty_config_toml(): ConfigToml {
	return {};
}

export function config_toml_from_unknown(value: unknown): ConfigToml {
	if (isTomlTable(value)) {
		return value as ConfigToml;
	}
	return {};
}

export function isTomlTable(value: unknown): value is TomlTable {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
