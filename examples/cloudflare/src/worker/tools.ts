import {
	defineDynamicTool,
	defineDynamicToolset,
	dynamicToolResponse,
} from "@jrkropp/codex-js/server";

export const cloudflareExampleTools = defineDynamicToolset([
	defineDynamicTool({
		name: "lookup_deployment",
		description: "Look up the current Cloudflare deployment target.",
		inputSchema: {
			type: "object",
			properties: {
				name: { type: "string" },
			},
			required: ["name"],
			additionalProperties: false,
		},
		async execute(args) {
			const deploymentName = readString(args, "name") ?? "codex-js";
			return dynamicToolResponse.text(
				`${deploymentName} is running in a Cloudflare Worker with a Durable Object app-server session.`,
			);
		},
	}),
	defineDynamicTool({
		namespace: "billing",
		name: "lookup_invoice",
		description: "Look up a demo invoice by id.",
		deferLoading: true,
		inputSchema: {
			type: "object",
			properties: {
				invoiceId: { type: "string" },
			},
			required: ["invoiceId"],
			additionalProperties: false,
		},
		async execute(args) {
			const invoiceId = readString(args, "invoiceId") ?? "demo";
			return dynamicToolResponse.text(
				`Invoice ${invoiceId} is paid. This result came from a deferred namespaced dynamic tool.`,
			);
		},
	}),
]);

function readString(value: unknown, key: string): string | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const field = (value as Record<string, unknown>)[key];
	return typeof field === "string" ? field : null;
}
