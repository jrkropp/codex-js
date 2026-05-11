import type { ToolSpec } from "./tools/tool_spec";

export const REQUEST_PERMISSIONS_TOOL_NAME = "request_permissions";

export const PermissionGrantScope = {
	Turn: "turn",
	Session: "session",
} as const;

export type PermissionGrantScope =
	(typeof PermissionGrantScope)[keyof typeof PermissionGrantScope];

export const ReviewDecision = {
	Approved: "approved",
	ApprovedForSession: "approved_for_session",
	Denied: "denied",
	Abort: "abort",
	TimedOut: "timed_out",
} as const;

export type ReviewDecision =
	(typeof ReviewDecision)[keyof typeof ReviewDecision];

export type NetworkPermissions = {
	enabled?: boolean | null;
	[key: string]: unknown;
};

export type FileSystemPermissions = {
	entries?: Array<Record<string, unknown>>;
	[key: string]: unknown;
};

export type RequestPermissionProfile = {
	network?: NetworkPermissions | null;
	file_system?: FileSystemPermissions | null;
};

export type RequestPermissionsArgs = {
	reason?: string | null;
	permissions: RequestPermissionProfile;
};

export type RequestPermissionsResponse = {
	permissions: RequestPermissionProfile;
	scope?: PermissionGrantScope;
	strict_auto_review?: boolean;
};

export type RequestPermissionsEvent = {
	/** Responses API call id for the associated tool call, if available. */
	call_id: string;
	/** Turn id that this request belongs to. */
	turn_id: string;
	reason?: string | null;
	permissions: RequestPermissionProfile;
	cwd?: string | null;
};

export function createRequestPermissionsTool(description: string): ToolSpec {
	return {
		type: "function",
		name: REQUEST_PERMISSIONS_TOOL_NAME,
		description,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				reason: {
					type: "string",
					description:
						"Optional short explanation for why additional permissions are needed.",
				},
				permissions: permissionProfileSchema(),
			},
			required: ["permissions"],
			additionalProperties: false,
		},
	};
}

export function requestPermissionsToolDescription(): string {
	return "Request extra permissions for this turn.";
}

export function normalizeRequestPermissionsArgs(
	args: RequestPermissionsArgs,
): RequestPermissionsArgs {
	if (!args || typeof args !== "object") {
		throw new Error("request_permissions requires an object argument");
	}

	if (isEmptyRequestPermissionProfile(args.permissions)) {
		throw new Error("request_permissions requires at least one permission");
	}

	return {
		reason: args.reason ?? null,
		permissions: cloneRequestPermissionProfile(args.permissions),
	};
}

export function emptyRequestPermissionsResponse(): RequestPermissionsResponse {
	return {
		permissions: {},
		scope: PermissionGrantScope.Turn,
		strict_auto_review: false,
	};
}

export function deniedRequestPermissionsResponse(): RequestPermissionsResponse {
	return emptyRequestPermissionsResponse();
}

export function isEmptyRequestPermissionProfile(
	permissions: RequestPermissionProfile | null | undefined,
): boolean {
	return !permissions || (!permissions.network && !permissions.file_system);
}

export function cloneRequestPermissionProfile(
	permissions: RequestPermissionProfile,
): RequestPermissionProfile {
	return JSON.parse(JSON.stringify(permissions)) as RequestPermissionProfile;
}

function permissionProfileSchema() {
	return {
		type: "object",
		properties: {
			network: {
				type: "object",
				description: "Network permissions to request.",
				additionalProperties: true,
			},
			file_system: {
				type: "object",
				description: "File system permissions to request.",
				additionalProperties: true,
			},
		},
		additionalProperties: false,
	};
}
