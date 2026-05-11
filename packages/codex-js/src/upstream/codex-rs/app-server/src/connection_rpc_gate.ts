export class ConnectionRpcGateClosedError extends Error {
	constructor() {
		super("Codex App Server connection is closed.");
		this.name = "ConnectionRpcGateClosedError";
	}
}

export class ConnectionRpcGate {
	private accepting = true;
	private inFlight = 0;
	private readonly shutdownWaiters = new Set<() => void>();

	isAccepting(): boolean {
		return this.accepting;
	}

	async run<T>(work: () => Promise<T> | T): Promise<T> {
		if (!this.accepting) {
			throw new ConnectionRpcGateClosedError();
		}
		this.inFlight += 1;
		try {
			return await work();
		} finally {
			this.inFlight -= 1;
			if (!this.accepting && this.inFlight === 0) {
				for (const resolve of this.shutdownWaiters) {
					resolve();
				}
				this.shutdownWaiters.clear();
			}
		}
	}

	async shutdown(): Promise<void> {
		this.accepting = false;
		if (this.inFlight === 0) {
			return;
		}
		await new Promise<void>((resolve) => {
			this.shutdownWaiters.add(resolve);
		});
	}
}
