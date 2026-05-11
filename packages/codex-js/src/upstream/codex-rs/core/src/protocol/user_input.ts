export type ByteRange = {
	start: number;
	end: number;
};

export type TextElement = {
	byte_range: ByteRange;
	placeholder?: string;
};

export type UserInput =
	| { type: "text"; text: string; text_elements?: TextElement[] }
	| { type: "image"; image_url: string }
	| { type: "local_image"; path: string }
	| { type: "skill"; name: string; path: string }
	| { type: "mention"; name: string; path: string };

export type MentionInput = Extract<UserInput, { type: "mention" }>;
