import type {
	PermissionProfile,
	PermissionProfileBuiltinName,
	SandboxPolicy,
} from "../protocol";

export const BUILT_IN_READ_ONLY_PROFILE = ":read-only";
export const BUILT_IN_WORKSPACE_PROFILE = ":workspace";
export const BUILT_IN_DANGER_NO_SANDBOX_PROFILE = ":danger-no-sandbox";

export function defaultBuiltinPermissionProfileName(input: {
	trusted?: boolean | null;
	untrusted?: boolean | null;
} = {}): PermissionProfileBuiltinName {
	return input.trusted || input.untrusted
		? BUILT_IN_WORKSPACE_PROFILE
		: BUILT_IN_READ_ONLY_PROFILE;
}

export function readOnlyPermissionProfile(): PermissionProfile {
	return {
		type: "managed",
		file_system: {
			type: "restricted",
			entries: [
				{
					path: { type: "special", value: "root" },
					access: "read",
				},
			],
		},
		network: "restricted",
	};
}

export function workspaceWritePermissionProfile(): PermissionProfile {
	return {
		type: "managed",
		file_system: {
			type: "restricted",
			entries: [
				{
					path: { type: "special", value: "project_roots" },
					access: "read-write",
				},
			],
		},
		network: "restricted",
	};
}

export function disabledPermissionProfile(): PermissionProfile {
	return {
		type: "disabled",
	};
}

export function builtinPermissionProfile(
	name: PermissionProfileBuiltinName,
): PermissionProfile {
	switch (name) {
		case BUILT_IN_READ_ONLY_PROFILE:
			return readOnlyPermissionProfile();
		case BUILT_IN_WORKSPACE_PROFILE:
			return workspaceWritePermissionProfile();
		case BUILT_IN_DANGER_NO_SANDBOX_PROFILE:
			return disabledPermissionProfile();
	}
}

export function permissionProfileFromLegacySandboxPolicy(
	sandboxPolicy: SandboxPolicy | null | undefined,
): PermissionProfile {
	const mode = legacySandboxPolicyMode(sandboxPolicy);
	switch (mode) {
		case "danger-full-access":
			return disabledPermissionProfile();
		case "read-only":
			return readOnlyPermissionProfile();
		case "workspace-write":
			return workspaceWritePermissionProfile();
		case "external":
			return {
				type: "external",
				network: legacySandboxPolicyNetwork(sandboxPolicy),
			};
	}
}

export function legacySandboxPolicyFromPermissionProfile(
	permissionProfile: PermissionProfile | null | undefined,
	cwd = "",
): SandboxPolicy {
	const normalizedProfile = normalizePermissionProfile(permissionProfile);
	const type = permissionProfileType(normalizedProfile);
	if (type === "disabled") {
		return { mode: "danger-full-access" };
	}
	if (type === "external") {
		return {
			mode: "external",
			network_access: permissionProfileNetwork(normalizedProfile),
		};
	}
	if (permissionProfileFileSystemMode(normalizedProfile) === "read-only") {
		return {
			mode: "read-only",
			network_access: permissionProfileNetwork(normalizedProfile),
		};
	}
	return {
		mode: "workspace-write",
		...(cwd ? { cwd } : {}),
		network_access: permissionProfileNetwork(normalizedProfile),
	};
}

export function effectivePermissionProfile(input: {
	permission_profile?: PermissionProfile | null;
	sandbox_policy?: SandboxPolicy | null;
}): PermissionProfile {
	return input.permission_profile && Object.keys(input.permission_profile).length > 0
		? normalizePermissionProfile(input.permission_profile)
		: permissionProfileFromLegacySandboxPolicy(input.sandbox_policy);
}

export function builtinPermissionProfileNameFromProfile(
	permissionProfile: PermissionProfile | null | undefined,
): PermissionProfileBuiltinName {
	const normalizedProfile = normalizePermissionProfile(permissionProfile);
	const type = permissionProfileType(normalizedProfile);
	if (type === "disabled") {
		return BUILT_IN_DANGER_NO_SANDBOX_PROFILE;
	}
	return permissionProfileFileSystemMode(normalizedProfile) === "read-only"
		? BUILT_IN_READ_ONLY_PROFILE
		: BUILT_IN_WORKSPACE_PROFILE;
}

export function activePermissionProfileForBuiltin(
	id: PermissionProfileBuiltinName,
) {
	return {
		id,
		extends: null,
		modifications: [],
	};
}

export function active_permission_profile(
	permissionProfile: PermissionProfile | null | undefined,
) {
	return activePermissionProfileForBuiltin(
		builtinPermissionProfileNameFromProfile(permissionProfile),
	);
}

export function validatePermissionProfile(
	permissionProfile: PermissionProfile | null | undefined,
): string[] {
	const warnings: string[] = [];
	const profileType = permissionProfileType(permissionProfile);
	if (profileType.startsWith(":")) {
		warnings.push(
			`Permission profile names beginning with ":" are reserved for Codex built-ins: ${profileType}`,
		);
	}
	return warnings;
}

function legacySandboxPolicyMode(
	sandboxPolicy: SandboxPolicy | null | undefined,
): "danger-full-access" | "workspace-write" | "read-only" | "external" {
	const mode = stringField(sandboxPolicy, ["mode", "type", "kind"]);
	if (
		mode === "danger-full-access" ||
		mode === "danger_full_access" ||
		mode === "disabled"
	) {
		return "danger-full-access";
	}
	if (mode === "read-only" || mode === "read_only" || mode === "readonly") {
		return "read-only";
	}
	if (mode === "external" || mode === "external_sandbox") {
		return "external";
	}
	return "workspace-write";
}

function legacySandboxPolicyNetwork(
	sandboxPolicy: SandboxPolicy | null | undefined,
): "enabled" | "restricted" {
	const value = stringField(sandboxPolicy, ["network_access", "network"]);
	return value === "restricted" || value === "disabled" ? "restricted" : "enabled";
}

function permissionProfileType(
	permissionProfile: PermissionProfile | null | undefined,
): string {
	return stringField(permissionProfile, ["type", "mode", "profile"]) ?? "managed";
}

function normalizePermissionProfile(
	permissionProfile: PermissionProfile | null | undefined,
): PermissionProfile {
	const type = permissionProfileType(permissionProfile);
	switch (type) {
		case "danger-full-access":
		case "danger-no-sandbox":
		case "disabled":
			return disabledPermissionProfile();
		case "read-only":
		case "readonly":
			return readOnlyPermissionProfile();
		case "workspace":
		case "workspace-write":
			return workspaceWritePermissionProfile();
		default:
			return permissionProfile && Object.keys(permissionProfile).length > 0
				? permissionProfile
				: readOnlyPermissionProfile();
	}
}

function permissionProfileFileSystemMode(
	permissionProfile: PermissionProfile | null | undefined,
): "read-only" | "workspace-write" {
	const fileSystem = recordField(permissionProfile, "file_system");
	const entries = Array.isArray(fileSystem?.entries) ? fileSystem.entries : [];
	if (
		entries.length > 0 &&
		entries.every(
			(entry) =>
				typeof entry === "object" &&
				entry !== null &&
				(entry as { access?: unknown }).access === "read",
		)
	) {
		return "read-only";
	}
	return "workspace-write";
}

function permissionProfileNetwork(
	permissionProfile: PermissionProfile | null | undefined,
): "enabled" | "restricted" {
	const network = permissionProfile
		? (permissionProfile.network as unknown)
		: null;
	if (typeof network === "string") {
		return network === "enabled" ? "enabled" : "restricted";
	}
	if (
		typeof network === "object" &&
		network !== null &&
		"enabled" in network &&
		(network as { enabled?: unknown }).enabled === true
	) {
		return "enabled";
	}
	return "restricted";
}

function recordField(
	value: unknown,
	field: string,
): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const fieldValue = (value as Record<string, unknown>)[field];
	return typeof fieldValue === "object" &&
		fieldValue !== null &&
		!Array.isArray(fieldValue)
		? (fieldValue as Record<string, unknown>)
		: null;
}

function stringField(value: unknown, fields: string[]): string | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	for (const field of fields) {
		const fieldValue = (value as Record<string, unknown>)[field];
		if (typeof fieldValue === "string" && fieldValue.trim().length > 0) {
			return fieldValue.trim().toLowerCase().replaceAll("_", "-");
		}
	}
	return null;
}
