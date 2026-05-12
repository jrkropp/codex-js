export type StreamTextChunk<TExtracted> = {
	visible_text: string;
	extracted: TExtracted[];
};

export type ProposedPlanSegment =
	| { type: "Normal"; text: string }
	| { type: "ProposedPlanStart" }
	| { type: "ProposedPlanDelta"; text: string }
	| { type: "ProposedPlanEnd" };

export type AssistantTextChunk = {
	visible_text: string;
	citations: string[];
	plan_segments: ProposedPlanSegment[];
};

const OPEN_TAG = "<proposed_plan>";
const CLOSE_TAG = "</proposed_plan>";
const CITATION_OPEN_TAG = "<oai-mem-citation>";
const CITATION_CLOSE_TAG = "</oai-mem-citation>";

type PlanTag = "ProposedPlan";

type TagSpec<T extends string> = {
	open: string;
	close: string;
	tag: T;
};

type TaggedLineSegment<T extends string> =
	| { type: "Normal"; text: string }
	| { type: "TagStart"; tag: T }
	| { type: "TagDelta"; tag: T; text: string }
	| { type: "TagEnd"; tag: T };

export class ProposedPlanParser {
	private readonly parser = new TaggedLineParser<PlanTag>([
		{
			open: OPEN_TAG,
			close: CLOSE_TAG,
			tag: "ProposedPlan",
		},
	]);

	push_str(chunk: string): StreamTextChunk<ProposedPlanSegment> {
		return mapProposedPlanSegments(this.parser.parse(chunk));
	}

	finish(): StreamTextChunk<ProposedPlanSegment> {
		return mapProposedPlanSegments(this.parser.finish());
	}
}

class TaggedLineParser<T extends string> {
	private activeTag: T | null = null;
	private detectTag = true;
	private lineBuffer = "";

	constructor(private readonly specs: TagSpec<T>[]) {}

	parse(delta: string): TaggedLineSegment<T>[] {
		const segments: TaggedLineSegment<T>[] = [];
		let run = "";

		for (const ch of delta) {
			if (this.detectTag) {
				if (run.length > 0) {
					this.pushText(run, segments);
					run = "";
				}
				this.lineBuffer += ch;
				if (ch === "\n") {
					this.finishLine(segments);
					continue;
				}
				const slug = this.lineBuffer.trimStart();
				if (slug.length === 0 || this.isTagPrefix(slug)) {
					continue;
				}
				const buffered = this.lineBuffer;
				this.lineBuffer = "";
				this.detectTag = false;
				this.pushText(buffered, segments);
				continue;
			}

			run += ch;
			if (ch === "\n") {
				this.pushText(run, segments);
				run = "";
				this.detectTag = true;
			}
		}

		if (run.length > 0) {
			this.pushText(run, segments);
		}

		return segments;
	}

	finish(): TaggedLineSegment<T>[] {
		const segments: TaggedLineSegment<T>[] = [];
		if (this.lineBuffer.length > 0) {
			const buffered = this.lineBuffer;
			this.lineBuffer = "";
			const withoutNewline = buffered.endsWith("\n")
				? buffered.slice(0, -1)
				: buffered;
			const slug = withoutNewline.trimStart().trimEnd();

			const openTag = this.matchOpen(slug);
			const closeTag = this.matchClose(slug);
			if (openTag && this.activeTag === null) {
				pushTaggedSegment(segments, { type: "TagStart", tag: openTag });
				this.activeTag = openTag;
			} else if (closeTag && this.activeTag === closeTag) {
				pushTaggedSegment(segments, { type: "TagEnd", tag: closeTag });
				this.activeTag = null;
			} else {
				this.pushText(buffered, segments);
			}
		}

		if (this.activeTag) {
			pushTaggedSegment(segments, { type: "TagEnd", tag: this.activeTag });
			this.activeTag = null;
		}
		this.detectTag = true;
		return segments;
	}

	private finishLine(segments: TaggedLineSegment<T>[]): void {
		const line = this.lineBuffer;
		this.lineBuffer = "";
		const withoutNewline = line.endsWith("\n") ? line.slice(0, -1) : line;
		const slug = withoutNewline.trimStart().trimEnd();

		const openTag = this.matchOpen(slug);
		if (openTag && this.activeTag === null) {
			pushTaggedSegment(segments, { type: "TagStart", tag: openTag });
			this.activeTag = openTag;
			this.detectTag = true;
			return;
		}

		const closeTag = this.matchClose(slug);
		if (closeTag && this.activeTag === closeTag) {
			pushTaggedSegment(segments, { type: "TagEnd", tag: closeTag });
			this.activeTag = null;
			this.detectTag = true;
			return;
		}

		this.detectTag = true;
		this.pushText(line, segments);
	}

	private pushText(
		text: string,
		segments: TaggedLineSegment<T>[],
	): void {
		if (this.activeTag) {
			pushTaggedSegment(segments, {
				type: "TagDelta",
				tag: this.activeTag,
				text,
			});
			return;
		}
		pushTaggedSegment(segments, { type: "Normal", text });
	}

	private isTagPrefix(slug: string): boolean {
		const trimmed = slug.trimEnd();
		return this.specs.some(
			(spec) => spec.open.startsWith(trimmed) || spec.close.startsWith(trimmed),
		);
	}

	private matchOpen(slug: string): T | null {
		return this.specs.find((spec) => spec.open === slug)?.tag ?? null;
	}

	private matchClose(slug: string): T | null {
		return this.specs.find((spec) => spec.close === slug)?.tag ?? null;
	}
}

function pushTaggedSegment<T extends string>(
	segments: TaggedLineSegment<T>[],
	segment: TaggedLineSegment<T>,
): void {
	switch (segment.type) {
		case "Normal":
			if (segment.text.length === 0) {
				return;
			}
			if (segments.at(-1)?.type === "Normal") {
				(segments[segments.length - 1] as Extract<
					TaggedLineSegment<T>,
					{ type: "Normal" }
				>).text += segment.text;
				return;
			}
			segments.push(segment);
			return;
		case "TagDelta":
			if (segment.text.length === 0) {
				return;
			}
			if (
				segments.at(-1)?.type === "TagDelta" &&
				(segments.at(-1) as Extract<
					TaggedLineSegment<T>,
					{ type: "TagDelta" }
				>).tag === segment.tag
			) {
				(segments[segments.length - 1] as Extract<
					TaggedLineSegment<T>,
					{ type: "TagDelta" }
				>).text += segment.text;
				return;
			}
			segments.push(segment);
			return;
		case "TagStart":
		case "TagEnd":
			segments.push(segment);
			return;
	}
}

function mapProposedPlanSegments(
	segments: TaggedLineSegment<PlanTag>[],
): StreamTextChunk<ProposedPlanSegment> {
	const out: StreamTextChunk<ProposedPlanSegment> = {
		visible_text: "",
		extracted: [],
	};
	for (const segment of segments) {
		switch (segment.type) {
			case "Normal":
				out.visible_text += segment.text;
				out.extracted.push({ type: "Normal", text: segment.text });
				break;
			case "TagStart":
				out.extracted.push({ type: "ProposedPlanStart" });
				break;
			case "TagDelta":
				out.extracted.push({ type: "ProposedPlanDelta", text: segment.text });
				break;
			case "TagEnd":
				out.extracted.push({ type: "ProposedPlanEnd" });
				break;
		}
	}
	return out;
}

export function stripProposedPlanBlocks(text: string): string {
	const parser = new ProposedPlanParser();
	const pushed = parser.push_str(text);
	const finished = parser.finish();
	return pushed.visible_text + finished.visible_text;
}

export function extractProposedPlanText(text: string): string | null {
	const parser = new ProposedPlanParser();
	let planText = "";
	let sawPlanBlock = false;
	for (const segment of [
		...parser.push_str(text).extracted,
		...parser.finish().extracted,
	]) {
		switch (segment.type) {
			case "ProposedPlanStart":
				sawPlanBlock = true;
				planText = "";
				break;
			case "ProposedPlanDelta":
				planText += segment.text;
				break;
			case "ProposedPlanEnd":
			case "Normal":
				break;
		}
	}
	return sawPlanBlock ? planText : null;
}

export class AssistantTextStreamParser {
	private readonly citations = new CitationStreamParser();
	private readonly plan = new ProposedPlanParser();

	constructor(private readonly planMode: boolean) {}

	push_str(chunk: string): AssistantTextChunk {
		const citationChunk = this.citations.push_str(chunk);
		const parsed = this.parseVisibleText(citationChunk.visible_text);
		return {
			...parsed,
			citations: citationChunk.extracted,
		};
	}

	finish(): AssistantTextChunk {
		const citationChunk = this.citations.finish();
		const parsed = this.parseVisibleText(citationChunk.visible_text);
		if (this.planMode) {
			const tail = this.plan.finish();
			parsed.visible_text += tail.visible_text;
			parsed.plan_segments.push(...tail.extracted);
		}
		return {
			...parsed,
			citations: citationChunk.extracted,
		};
	}

	private parseVisibleText(visibleText: string): AssistantTextChunk {
		if (!this.planMode) {
			return {
				visible_text: visibleText,
				citations: [],
				plan_segments: [],
			};
		}
		const planChunk = this.plan.push_str(visibleText);
		return {
			visible_text: planChunk.visible_text,
			citations: [],
			plan_segments: planChunk.extracted,
		};
	}
}

class CitationStreamParser {
	private buffer = "";
	private mode: "normal" | "citation" = "normal";

	push_str(chunk: string): StreamTextChunk<string> {
		this.buffer += chunk;
		return this.parse(false);
	}

	finish(): StreamTextChunk<string> {
		return this.parse(true);
	}

	private parse(finish: boolean): StreamTextChunk<string> {
		const out: StreamTextChunk<string> = { visible_text: "", extracted: [] };
		while (this.buffer.length > 0) {
			if (this.mode === "normal") {
				const startIndex = this.buffer.indexOf(CITATION_OPEN_TAG);
				if (startIndex === -1) {
					const suffix = finish
						? 0
						: partialTagSuffixLength(this.buffer, CITATION_OPEN_TAG);
					const length = this.buffer.length - suffix;
					out.visible_text += this.buffer.slice(0, length);
					this.buffer = this.buffer.slice(length);
					break;
				}
				out.visible_text += this.buffer.slice(0, startIndex);
				this.buffer = this.buffer.slice(startIndex + CITATION_OPEN_TAG.length);
				this.mode = "citation";
				continue;
			}

			const endIndex = this.buffer.indexOf(CITATION_CLOSE_TAG);
			if (endIndex === -1) {
				if (finish) {
					out.extracted.push(this.buffer);
					this.buffer = "";
					this.mode = "normal";
				}
				break;
			}
			out.extracted.push(this.buffer.slice(0, endIndex));
			this.buffer = this.buffer.slice(endIndex + CITATION_CLOSE_TAG.length);
			this.mode = "normal";
		}
		return out;
	}
}

function partialTagSuffixLength(text: string, tag: string): number {
	const maxLength = Math.min(text.length, tag.length - 1);
	for (let length = maxLength; length > 0; length -= 1) {
		if (tag.startsWith(text.slice(text.length - length))) {
			return length;
		}
	}
	return 0;
}
