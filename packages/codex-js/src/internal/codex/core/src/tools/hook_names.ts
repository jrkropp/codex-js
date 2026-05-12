export const HookToolEventName = {
	PreToolUse: "PreToolUse",
	PostToolUse: "PostToolUse",
	PermissionRequest: "PermissionRequest",
} as const;

export type HookToolEventName =
	(typeof HookToolEventName)[keyof typeof HookToolEventName];
