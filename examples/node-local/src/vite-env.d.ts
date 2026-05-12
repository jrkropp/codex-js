/// <reference types="vite/client" />

declare module "ws" {
	export class WebSocketServer {
		constructor(options: { noServer: boolean });
		handleUpgrade(
			request: import("node:http").IncomingMessage,
			socket: import("node:net").Socket,
			head: Buffer,
			callback: (socket: WebSocket) => void,
		): void;
	}

	export class WebSocket {
		on(event: "close", listener: () => void): this;
		send(data: string): void;
	}
}
