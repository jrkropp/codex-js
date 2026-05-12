import type { ClientRequestSerializationScope } from "../../app-server-protocol/src/protocol";

export type RequestSerializationQueueKey = string;

export class RequestSerializationQueues {
	private readonly tails = new Map<RequestSerializationQueueKey, Promise<unknown>>();

	async enqueue<T>(
		key: RequestSerializationQueueKey,
		work: () => Promise<T> | T,
	): Promise<T> {
		const previous = this.tails.get(key) ?? Promise.resolve();
		const current = previous
			.catch(() => undefined)
			.then(() => work());
		const tail = current.catch(() => undefined).finally(() => {
			if (this.tails.get(key) === tail) {
				this.tails.delete(key);
			}
		});
		this.tails.set(
			key,
			tail,
		);
		return current;
	}
}

export function requestSerializationQueueKeyFromScope(
	connectionId: number | string,
	scope: ClientRequestSerializationScope,
): RequestSerializationQueueKey {
	switch (scope.type) {
		case "global":
			return `global:${scope.key}`;
		case "thread":
			return `thread:${scope.threadId}`;
		case "threadPath":
			return `thread-path:${scope.path}`;
		case "commandExecProcess":
			return `connection:${connectionId}:command-exec-process:${scope.processId}`;
		case "process":
			return `connection:${connectionId}:process:${scope.processHandle}`;
		case "fuzzyFileSearchSession":
			return `fuzzy-file-search-session:${scope.sessionId}`;
		case "fsWatch":
			return `connection:${connectionId}:fs-watch:${scope.watchId}`;
		case "mcpOauth":
			return `mcp-oauth:${scope.serverName}`;
	}
}
