export interface ComposerSendState {
	hasSendableContent: boolean;
	isConnecting: boolean;
	isEnvironmentUnavailable: boolean;
	isRunning: boolean;
	isSendBusy: boolean;
	sendDisabled: boolean;
	stopDisabled: boolean;
}

export function deriveComposerSendState(input: {
	disabled: boolean;
	hasSendableContent: boolean;
	isConnecting: boolean;
	isEnvironmentUnavailable: boolean;
	isRunning: boolean;
	isSending: boolean;
}): ComposerSendState {
	const isSendBusy = input.isSending;
	return {
		hasSendableContent: input.hasSendableContent,
		isConnecting: input.isConnecting,
		isEnvironmentUnavailable: input.isEnvironmentUnavailable,
		isRunning: input.isRunning,
		isSendBusy,
		sendDisabled:
			input.disabled ||
			input.isConnecting ||
			input.isEnvironmentUnavailable ||
			input.isRunning ||
			isSendBusy ||
			!input.hasSendableContent,
		stopDisabled: !input.isRunning || input.isConnecting,
	};
}
