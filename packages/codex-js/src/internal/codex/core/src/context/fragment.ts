import type { ResponseItem } from "../models";

export type ContextualUserFragmentParams = {
	role: string;
	start_marker: string;
	end_marker: string;
	body: () => string;
};

export class ContextualUserFragment {
	readonly role: string;
	readonly start_marker: string;
	readonly end_marker: string;
	private readonly bodyFn: () => string;

	constructor(params: ContextualUserFragmentParams) {
		this.role = params.role;
		this.start_marker = params.start_marker;
		this.end_marker = params.end_marker;
		this.bodyFn = params.body;
	}

	body(): string {
		return this.bodyFn();
	}

	matchesText(text: string): boolean {
		return contextualFragmentMatchesText(text, {
			start_marker: this.start_marker,
			end_marker: this.end_marker,
		});
	}

	render(): string {
		if (!this.start_marker && !this.end_marker) {
			return this.body();
		}

		return `${this.start_marker}${this.body()}${this.end_marker}`;
	}

	toResponseItem(): ResponseItem {
		return {
			type: "message",
			role: this.role,
			content: [{ type: "input_text", text: this.render() }],
		};
	}
}

export function contextualFragmentMatchesText(
	text: string,
	markers: { start_marker: string; end_marker: string },
): boolean {
	if (!markers.start_marker || !markers.end_marker) {
		return false;
	}

	const startTrimmed = text.trimStart();
	const startsWithMarker =
		startTrimmed
			.slice(0, markers.start_marker.length)
			.toLowerCase() === markers.start_marker.toLowerCase();
	const endTrimmed = text.trimEnd();
	const endsWithMarker =
		endTrimmed
			.slice(Math.max(0, endTrimmed.length - markers.end_marker.length))
			.toLowerCase() === markers.end_marker.toLowerCase();
	return startsWithMarker && endsWithMarker;
}
