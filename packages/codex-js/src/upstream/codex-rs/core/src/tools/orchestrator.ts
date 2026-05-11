import {
	PermissionGrantScope,
	type RequestPermissionProfile,
	type RequestPermissionsResponse,
} from "../request_permissions";

export const ToolApprovalRequirement = {
	Skip: "skip",
	NeedsApproval: "needs_approval",
	Forbidden: "forbidden",
} as const;

export type ToolApprovalRequirement =
	| { type: typeof ToolApprovalRequirement.Skip }
	| { type: typeof ToolApprovalRequirement.NeedsApproval; reason?: string | null }
	| { type: typeof ToolApprovalRequirement.Forbidden; reason: string };

export class PermissionGrantStore {
	private readonly grants: RequestPermissionProfile[] = [];
	private strict_auto_review = false;

	record(response: RequestPermissionsResponse): void {
		if (!response.permissions || isEmpty(response.permissions)) {
			return;
		}
		this.grants.push(clone(response.permissions));
		if (response.strict_auto_review) {
			this.strict_auto_review = true;
		}
	}

	all(): RequestPermissionProfile[] {
		return this.grants.map(clone);
	}

	hasGrants(): boolean {
		return this.grants.length > 0;
	}

	strictAutoReviewEnabled(): boolean {
		return this.strict_auto_review;
	}

	clear(): void {
		this.grants.length = 0;
		this.strict_auto_review = false;
	}
}

export class ToolOrchestrator {
	static defaultApprovalRequirement(): ToolApprovalRequirement {
		return { type: ToolApprovalRequirement.Skip };
	}
}

export function normalizeRequestPermissionsResponseForCwd(
	response: RequestPermissionsResponse,
	cwd: string,
): RequestPermissionsResponse {
	const permissions = clone(response.permissions ?? {});
	const fileSystem = permissions.file_system;
	if (fileSystem && Array.isArray(fileSystem.entries)) {
		permissions.file_system = {
			...fileSystem,
			entries: fileSystem.entries.map((entry) =>
				materializeCwdEntry(entry, cwd),
			),
		};
	}

	return {
		permissions,
		scope: response.scope ?? PermissionGrantScope.Turn,
		strict_auto_review: response.strict_auto_review ?? false,
	};
}

function materializeCwdEntry(
	entry: Record<string, unknown>,
	cwd: string,
): Record<string, unknown> {
	if (entry.path === "$cwd" || entry.path === "cwd") {
		return { ...entry, path: cwd };
	}
	if (
		typeof entry.path === "object" &&
		entry.path !== null &&
		"value" in entry.path &&
		(entry.path as { value?: unknown }).value === "cwd"
	) {
		return { ...entry, path: cwd };
	}
	return { ...entry };
}

function isEmpty(permissions: RequestPermissionProfile): boolean {
	return !permissions.network && !permissions.file_system;
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
