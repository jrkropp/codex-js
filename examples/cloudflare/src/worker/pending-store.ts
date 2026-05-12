import type {
	PendingServerRequestRecord,
	PendingServerRequestStore,
	RequestId,
} from "@jrkropp/codex-js/server";

type SqlStorage = DurableObjectStorage["sql"];

type PendingServerRequestRow = {
	record_json: string;
	request_key: string;
};

export class DurableObjectPendingServerRequestStore implements PendingServerRequestStore {
	constructor(private readonly sql: SqlStorage) {}

	createSchema(): void {
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS pending_server_requests (
				request_key TEXT PRIMARY KEY,
				record_json TEXT NOT NULL
			)
		`);
	}

	delete(requestId: RequestId): void {
		this.sql.exec(
			"DELETE FROM pending_server_requests WHERE request_key = ?",
			requestKey(requestId),
		);
	}

	get(requestId: RequestId): PendingServerRequestRecord | null {
		const rows = this.sql
			.exec<PendingServerRequestRow>(
				"SELECT request_key, record_json FROM pending_server_requests WHERE request_key = ?",
				requestKey(requestId),
			)
			.toArray();
		const row = rows[0];
		return row ? parseRecord(row.record_json) : null;
	}

	list(): PendingServerRequestRecord[] {
		return this.sql
			.exec<PendingServerRequestRow>(
				"SELECT request_key, record_json FROM pending_server_requests",
			)
			.toArray()
			.map((row) => parseRecord(row.record_json));
	}

	put(record: PendingServerRequestRecord): void {
		this.sql.exec(
			"INSERT OR REPLACE INTO pending_server_requests (request_key, record_json) VALUES (?, ?)",
			requestKey(record.requestId),
			JSON.stringify(record),
		);
	}

	take(requestId: RequestId): PendingServerRequestRecord | null {
		const record = this.get(requestId);
		this.delete(requestId);
		return record;
	}
}

function parseRecord(value: string): PendingServerRequestRecord {
	return JSON.parse(value) as PendingServerRequestRecord;
}

function requestKey(requestId: RequestId): string {
	return `${typeof requestId}:${String(requestId)}`;
}
