export type TurnTimingSnapshot = {
	completed_at: number;
	duration_ms: number;
	time_to_first_token_ms: number | null;
};

export class TurnTimingState {
	private started_at_ms: number | null = null;
	private first_token_at_ms: number | null = null;

	markTurnStarted(now: number): number {
		this.started_at_ms = now;
		this.first_token_at_ms = null;
		return now;
	}

	markFirstToken(now: number): void {
		if (this.started_at_ms === null || this.first_token_at_ms !== null) {
			return;
		}

		this.first_token_at_ms = now;
	}

	completedAtAndDuration(now: number): TurnTimingSnapshot {
		const startedAt = this.started_at_ms ?? now;
		return {
			completed_at: now,
			duration_ms: Math.max(0, now - startedAt),
			time_to_first_token_ms:
				this.first_token_at_ms === null
					? null
					: Math.max(0, this.first_token_at_ms - startedAt),
		};
	}
}
