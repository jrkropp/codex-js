import {
	defineDynamicTool,
	defineDynamicToolset,
	dynamicToolResponse,
} from "@jrkropp/codex-js/server";
import { billingInvoiceById, objectArguments } from "../shared/billing";

export const billingDynamicTools = defineDynamicToolset([
	defineDynamicTool({
		namespace: "billing",
		name: "lookup_invoice",
		description: "Look up a sample invoice by invoice id.",
		inputSchema: {
			type: "object",
			properties: {
				invoiceId: {
					type: "string",
					description: "Invoice id such as INV-1001.",
				},
			},
			required: ["invoiceId"],
			additionalProperties: false,
		},
		async execute(args) {
			const invoice = billingInvoiceById(objectArguments(args).invoiceId);
			if (!invoice) {
				return dynamicToolResponse.error(
					"No matching sample invoice was found.",
				);
			}
			return dynamicToolResponse.text(JSON.stringify({ invoice }, null, 2));
		},
	}),
	defineDynamicTool({
		namespace: "billing",
		name: "refund_invoice",
		description: "Refund a sample invoice after the user confirms the action.",
		inputSchema: {
			type: "object",
			properties: {
				invoiceId: {
					type: "string",
					description: "Invoice id such as INV-1001.",
				},
				reason: {
					type: "string",
					description: "The reason for the refund.",
				},
			},
			required: ["invoiceId", "reason"],
			additionalProperties: false,
		},
	}),
]);
