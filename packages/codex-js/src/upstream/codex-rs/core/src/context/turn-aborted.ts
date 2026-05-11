import type { ResponseItem } from "../models";

export const TURN_ABORTED_INTERRUPTED_GUIDANCE =
	"The user interrupted the previous turn on purpose. Any running unified exec processes may still be running in the background. If any tools/commands were aborted, they may have partially executed.";

export function turnAbortedResponseItem(
	guidance = TURN_ABORTED_INTERRUPTED_GUIDANCE,
): ResponseItem {
	return {
		type: "message",
		role: "user",
		content: [
			{
				type: "input_text",
				text: `<turn_aborted>\n${guidance}\n</turn_aborted>`,
			},
		],
	};
}
