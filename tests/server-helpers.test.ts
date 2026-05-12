import { describe, expect, it } from "vitest";
import { CodexAppServerConnectionSessionState } from "../packages/codex-js/src/runtime/index";
import {
	defineDynamicTool,
	defineDynamicToolset,
	dynamicToolResponse,
	dynamicToolSpecFromDefinition,
} from "../packages/codex-js/src/server/dynamic-tools";

describe("dynamic tool helpers", () => {
	it("maps public camelCase definitions to Codex dynamic tool specs", () => {
		const tool = defineDynamicTool({
			namespace: "billing",
			name: "lookup_invoice",
			description: "Look up an invoice.",
			deferLoading: true,
			inputSchema: {
				type: "object",
				properties: { invoiceId: { type: "string" } },
				required: ["invoiceId"],
				additionalProperties: false,
			},
		});

		expect(dynamicToolSpecFromDefinition(tool)).toEqual({
			namespace: "billing",
			name: "lookup_invoice",
			description: "Look up an invoice.",
			defer_loading: true,
			input_schema: {
				type: "object",
				properties: { invoiceId: { type: "string" } },
				required: ["invoiceId"],
				additionalProperties: false,
			},
		});
	});

	it("uses Codex-compatible response shapes", () => {
		expect(dynamicToolResponse.text("ok")).toEqual({
			contentItems: [{ text: "ok", type: "inputText" }],
			success: true,
		});
		expect(dynamicToolResponse.image("https://example.com/image.png")).toEqual({
			contentItems: [
				{ imageUrl: "https://example.com/image.png", type: "inputImage" },
			],
			success: true,
		});
		expect(dynamicToolResponse.error("failed")).toEqual({
			contentItems: [{ text: "failed", type: "inputText" }],
			success: false,
		});
	});

	it("rejects invalid names, deferred tools without namespaces, and duplicates", () => {
		const schema = { type: "object", properties: {} };

		expect(() =>
			defineDynamicTool({
				name: "bad name",
				description: "Invalid.",
				inputSchema: schema,
			}),
		).toThrow(/Responses API/u);

		expect(() =>
			defineDynamicTool({
				name: "deferred_tool",
				description: "Invalid.",
				deferLoading: true,
				inputSchema: schema,
			}),
		).toThrow(/namespace/u);

		expect(() =>
			defineDynamicToolset([
				{
					namespace: "billing",
					name: "lookup_invoice",
					description: "First.",
					inputSchema: schema,
				},
				{
					namespace: "billing",
					name: "lookup_invoice",
					description: "Duplicate.",
					inputSchema: schema,
				},
			]),
		).toThrow(/Duplicate dynamic tool/u);
	});

	it("rejects unsupported JSON schema shapes early", () => {
		expect(() =>
			defineDynamicTool({
				name: "bad_schema",
				description: "Invalid.",
				inputSchema: { type: "string" },
			}),
		).toThrow(/type "object"/u);

		expect(() =>
			defineDynamicTool({
				name: "bad_required",
				description: "Invalid.",
				inputSchema: { type: "object", required: "id" },
			}),
		).toThrow(/required/u);
	});
});

describe("connection session snapshots", () => {
	it("restores initialized app-server connection state without reinitializing", () => {
		const session = new CodexAppServerConnectionSessionState();
		session.initialize({
			appServerClientName: "test-client",
			clientVersion: "1.2.3",
			experimentalApiEnabled: true,
			optedOutNotificationMethods: new Set(["thread/event"]),
		});

		const restored = CodexAppServerConnectionSessionState.fromSnapshot(
			session.snapshot(),
		);

		expect(restored.initialized()).toBe(true);
		expect(restored.appServerClientName()).toBe("test-client");
		expect(restored.clientVersion()).toBe("1.2.3");
		expect(restored.experimentalApiEnabled()).toBe(true);
		expect(Array.from(restored.optedOutNotificationMethods())).toEqual([
			"thread/event",
		]);
	});
});
