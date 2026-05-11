import {
	TOOL_SEARCH_DEFAULT_LIMIT,
	TOOL_SEARCH_TOOL_NAME,
	type ToolSearchEntry,
	tool_search_outputs,
} from "../tool_search_entry";
import {
	FunctionCallError,
	type ToolHandler,
	type ToolInvocation,
	ToolKind,
	type ToolPayload,
} from "../context";
import { ToolName, type ToolNameInput } from "../tool_name";

export class ToolSearchOutput {
	constructor(readonly tools: unknown[]) {}

	logPreview(): string {
		return `${this.tools.length} tools`;
	}

	successForLogging(): boolean {
		return true;
	}

	toResponseItem(callId: string) {
		return {
			type: "tool_search_output" as const,
			call_id: callId,
			status: "completed" as const,
			execution: "client" as const,
			tools: this.tools,
		};
	}

	postToolUseResponse(): unknown | null {
		return { tools: this.tools };
	}

	codeModeResult(): unknown {
		return { tools: this.tools };
	}
}

export class ToolSearchHandler implements ToolHandler<ToolSearchOutput> {
	private readonly entries: ToolSearchEntry[];
	private readonly searchEngine: Bm25SearchEngine;

	constructor(entries: readonly ToolSearchEntry[]) {
		this.entries = [...entries];
		this.searchEngine = new Bm25SearchEngine(
			this.entries.map((entry) => entry.search_text),
		);
	}

	toolName(): ToolNameInput {
		return ToolName.plain(TOOL_SEARCH_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	matchesKind(payload: ToolPayload): boolean {
		return payload.type === "tool_search";
	}

	async handle(invocation: ToolInvocation): Promise<ToolSearchOutput> {
		const args =
			invocation.payload.type === "tool_search"
				? invocation.payload.arguments
				: null;
		if (!args) {
			throw FunctionCallError.fatal(
				`${TOOL_SEARCH_TOOL_NAME} handler received unsupported payload`,
			);
		}

		const query = String(args.query ?? "").trim();
		if (!query) {
			throw FunctionCallError.respondToModel("query must not be empty");
		}

		const requestedLimit =
			typeof args.limit === "number" && Number.isFinite(args.limit)
				? Math.trunc(args.limit)
				: null;
		if (requestedLimit === 0) {
			throw FunctionCallError.respondToModel("limit must be greater than zero");
		}
		const limit = requestedLimit ?? TOOL_SEARCH_DEFAULT_LIMIT;
		if (this.entries.length === 0) {
			return new ToolSearchOutput([]);
		}

		const results = this.search(query, Math.max(1, limit), requestedLimit === null);
		return new ToolSearchOutput(tool_search_outputs(results));
	}

	private search(
		query: string,
		limit: number,
		useDefaultLimit: boolean,
	): ToolSearchEntry[] {
		let results = this.searchEngine
			.search(query, limit)
			.map((result) => this.entries[result.documentIndex])
			.filter((entry): entry is ToolSearchEntry => Boolean(entry));

		if (!useDefaultLimit) {
			return results;
		}

		if (
			results.some(
				(entry) => entry.limit_bucket === COMPUTER_USE_MCP_SERVER_NAME,
			)
		) {
			results = this.searchEngine
				.search(query, COMPUTER_USE_TOOL_SEARCH_LIMIT)
				.map((result) => this.entries[result.documentIndex])
				.filter((entry): entry is ToolSearchEntry => Boolean(entry));
		}
		return limitResultsByBucket(results);
	}
}

const COMPUTER_USE_MCP_SERVER_NAME = "computer-use";
const COMPUTER_USE_TOOL_SEARCH_LIMIT = 20;

type Bm25SearchResult = {
	documentIndex: number;
	score: number;
};

class Bm25SearchEngine {
	private readonly averageDocumentLength: number;
	private readonly documentFrequency = new Map<string, number>();
	private readonly documents: Array<{
		length: number;
		termFrequency: Map<string, number>;
	}> = [];

	constructor(documents: readonly string[]) {
		for (const document of documents) {
			const tokens = tokenize(document);
			const termFrequency = new Map<string, number>();
			for (const token of tokens) {
				termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
			}
			for (const token of termFrequency.keys()) {
				this.documentFrequency.set(
					token,
					(this.documentFrequency.get(token) ?? 0) + 1,
				);
			}
			this.documents.push({
				length: tokens.length,
				termFrequency,
			});
		}
		this.averageDocumentLength =
			this.documents.reduce((sum, document) => sum + document.length, 0) /
				Math.max(1, this.documents.length);
	}

	search(query: string, limit: number): Bm25SearchResult[] {
		const queryTerms = tokenize(query);
		const scores = this.documents
			.map((document, documentIndex) => ({
				documentIndex,
				score: this.score(document, queryTerms),
			}))
			.filter((result) => result.score > 0)
			.sort((a, b) => b.score - a.score || a.documentIndex - b.documentIndex);
		return scores.slice(0, limit);
	}

	private score(
		document: { length: number; termFrequency: Map<string, number> },
		queryTerms: readonly string[],
	): number {
		const k1 = 1.2;
		const b = 0.75;
		let score = 0;
		for (const term of queryTerms) {
			const frequency = document.termFrequency.get(term) ?? 0;
			if (frequency === 0) {
				continue;
			}
			const documentFrequency = this.documentFrequency.get(term) ?? 0;
			const idf = Math.log(
				1 +
					(this.documents.length - documentFrequency + 0.5) /
						(documentFrequency + 0.5),
			);
			const denominator =
				frequency +
				k1 *
					(1 -
						b +
						b *
							(document.length / Math.max(1, this.averageDocumentLength)));
			score += idf * ((frequency * (k1 + 1)) / denominator);
		}
		return score;
	}
}

function tokenize(value: string): string[] {
	return value
		.toLowerCase()
		.match(/[\p{L}\p{N}_]+/gu) ?? [];
}

function limitResultsByBucket(results: readonly ToolSearchEntry[]): ToolSearchEntry[] {
	const counts = new Map<string, number>();
	const limited: ToolSearchEntry[] = [];
	for (const result of results) {
		const bucket = result.limit_bucket ?? null;
		if (!bucket) {
			limited.push(result);
			continue;
		}
		const count = counts.get(bucket) ?? 0;
		if (count >= defaultLimitForBucket(bucket)) {
			continue;
		}
		counts.set(bucket, count + 1);
		limited.push(result);
	}
	return limited;
}

function defaultLimitForBucket(bucket: string): number {
	return bucket === COMPUTER_USE_MCP_SERVER_NAME
		? COMPUTER_USE_TOOL_SEARCH_LIMIT
		: TOOL_SEARCH_DEFAULT_LIMIT;
}
