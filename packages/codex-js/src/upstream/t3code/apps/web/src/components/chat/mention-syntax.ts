export const PROJECT_MENTION_SIGIL = "@";
export const LEGACY_PROJECT_MENTION_SIGIL = "$";
export const SKILL_MENTION_SIGIL = "$";
export const TOOL_MENTION_SIGIL = PROJECT_MENTION_SIGIL;
export const PLUGIN_TEXT_MENTION_SIGIL = PROJECT_MENTION_SIGIL;

export function isMentionNameChar(byte: number): boolean {
	return (
		(byte >= 0x30 && byte <= 0x39) ||
		(byte >= 0x41 && byte <= 0x5a) ||
		(byte >= 0x61 && byte <= 0x7a) ||
		byte === 0x5f ||
		byte === 0x2d
	);
}

export function mentionToken(name: string): string {
	return `${PROJECT_MENTION_SIGIL}${name}`;
}

export function legacyMentionToken(name: string): string {
	return `${LEGACY_PROJECT_MENTION_SIGIL}${name}`;
}

export function skillToken(name: string): string {
	return `${SKILL_MENTION_SIGIL}${name}`;
}
