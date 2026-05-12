export type RealtimeConversationPhase =
	| "Inactive"
	| "Starting"
	| "Active"
	| "Stopping";

export type RealtimeConversationUiState = {
	disabled?: boolean;
	error?: string | null;
	phase: RealtimeConversationPhase;
	realtimeSessionId?: string | null;
	requestedClose: boolean;
	transport: "webrtc";
	onStart: () => void;
	onStop: () => void;
};

export type RealtimeConversationControlState = {
	action: "start" | "stop";
	isActive: boolean;
	isBusy: boolean;
	label: string;
	title: string;
};

export function isRealtimeConversationLive(
	phase: RealtimeConversationPhase,
): boolean {
	return (
		phase === "Starting" || phase === "Active" || phase === "Stopping"
	);
}

export function getRealtimeConversationControlState(
	realtimeConversation: Pick<
		RealtimeConversationUiState,
		"error" | "phase" | "requestedClose"
	>,
): RealtimeConversationControlState {
	switch (realtimeConversation.phase) {
		case "Starting":
			return {
				action: "start",
				isActive: true,
				isBusy: true,
				label: "Starting realtime voice",
				title: "Starting realtime voice",
			};
		case "Active":
			return {
				action: "stop",
				isActive: true,
				isBusy: false,
				label: "Stop realtime voice",
				title: "Stop realtime voice",
			};
		case "Stopping":
			return {
				action: "stop",
				isActive: true,
				isBusy: true,
				label: "Stopping realtime voice",
				title: "Stopping realtime voice",
			};
		case "Inactive":
		default: {
			const title = realtimeConversation.error
				? `Start realtime voice. Last error: ${realtimeConversation.error}`
				: "Start realtime voice";
			return {
				action: "start",
				isActive: false,
				isBusy: false,
				label: "Start realtime voice",
				title,
			};
		}
	}
}

export class RecordingMeterState {
	private readonly history: string[] = ["⠤", "⠤", "⠤", "⠤"];
	private env = 0;
	private noiseEma = 0.02;

	nextText(peak: number): string {
		const symbols = ["⠤", "⠴", "⠶", "⠷", "⡷", "⡿", "⣿"];
		const latestPeak = Math.max(0, Math.min(1, peak));

		if (latestPeak > this.env) {
			this.env = 0.8 * latestPeak + 0.2 * this.env;
		} else {
			this.env = 0.25 * latestPeak + 0.75 * this.env;
		}

		const rmsApprox = this.env * 0.7;
		this.noiseEma = 0.95 * this.noiseEma + 0.05 * rmsApprox;
		const refLevel = Math.max(this.noiseEma, 0.01);
		const fastSignal = 0.8 * latestPeak + 0.2 * this.env;
		const raw = Math.max(0, fastSignal / (refLevel * 2));
		const compressed = Math.min(1, Math.log1p(raw) / Math.log1p(1.6));
		const index = Math.max(
			0,
			Math.min(
				symbols.length - 1,
				Math.round(compressed * (symbols.length - 1)),
			),
		);

		this.history.shift();
		this.history.push(symbols[index] ?? "⠤");
		return this.history.join("");
	}
}
