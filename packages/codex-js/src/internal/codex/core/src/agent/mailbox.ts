import type { AgentPath } from "./role";

export type InterAgentCommunication = {
	author: AgentPath;
	recipient: AgentPath;
	items: unknown[];
	content: string;
	trigger_turn: boolean;
	seq?: number;
};

export class Mailbox {
	private readonly pending: InterAgentCommunication[] = [];
	private next_seq = 0;

	static new(): { mailbox: Mailbox; receiver: MailboxReceiver } {
		const mailbox = new Mailbox();
		return { mailbox, receiver: new MailboxReceiver(mailbox) };
	}

	send(communication: Omit<InterAgentCommunication, "seq">): number {
		this.next_seq += 1;
		this.pending.push({ ...communication, seq: this.next_seq });
		return this.next_seq;
	}

	drain(): InterAgentCommunication[] {
		return this.pending.splice(0);
	}

	has_pending(): boolean {
		return this.pending.length > 0;
	}

	has_pending_trigger_turn(): boolean {
		return this.pending.some((mail) => mail.trigger_turn);
	}
}

export class MailboxReceiver {
	constructor(private readonly mailbox: Mailbox) {}

	has_pending(): boolean {
		return this.mailbox.has_pending();
	}

	has_pending_trigger_turn(): boolean {
		return this.mailbox.has_pending_trigger_turn();
	}

	drain(): InterAgentCommunication[] {
		return this.mailbox.drain();
	}
}
