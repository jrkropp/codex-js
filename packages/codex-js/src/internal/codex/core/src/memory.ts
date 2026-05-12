export const ThreadMemoryMode = {
	Enabled: "Enabled",
	Disabled: "Disabled",
} as const;

export type ThreadMemoryMode =
	(typeof ThreadMemoryMode)[keyof typeof ThreadMemoryMode];

export const ThreadMemoryModeSessionMetaValue = {
	Enabled: "enabled",
	Disabled: "disabled",
} as const;

export type ThreadMemoryModeSessionMetaValue =
	(typeof ThreadMemoryModeSessionMetaValue)[keyof typeof ThreadMemoryModeSessionMetaValue];

export function threadMemoryModeToSessionMetaValue(
	mode: ThreadMemoryMode,
): ThreadMemoryModeSessionMetaValue {
	switch (mode) {
		case ThreadMemoryMode.Enabled:
			return ThreadMemoryModeSessionMetaValue.Enabled;
		case ThreadMemoryMode.Disabled:
			return ThreadMemoryModeSessionMetaValue.Disabled;
	}
}

export type MemoryCitation = {
	entries: MemoryCitationEntry[];
	rolloutIds: string[];
};

export type MemoryCitationEntry = {
	path: string;
	lineStart: number;
	lineEnd: number;
	note: string;
};
