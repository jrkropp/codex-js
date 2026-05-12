import type {
	ActivePermissionProfile,
	PermissionProfile,
	SandboxPolicy,
} from "../../core/src/protocol";

export type PermissionsToml = {
	permission_profile?: PermissionProfile | null;
	active_permission_profile?: ActivePermissionProfile | null;
	sandbox_policy?: SandboxPolicy | null;
};
