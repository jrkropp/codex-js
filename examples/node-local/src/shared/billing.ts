import type {
	DynamicToolCallResponse,
	ServerRequest,
} from "@jrkropp/codex-js/server";

export const billingSuggestedPrompts = [
	"Look up invoice INV-1001.",
	"Can you refund invoice INV-1001 because the customer was double charged?",
	"Refund invoice INV-1002 for a duplicate purchase.",
	"Plan a safer refund workflow. First ask me two short questions with request_user_input, then return the final plan inside <proposed_plan> tags.",
];

export type BillingInvoice = {
	amount: string;
	customer: string;
	id: string;
	status: "open" | "paid" | "refunded";
};

export const billingInvoices: BillingInvoice[] = [
	{
		amount: "$42.00",
		customer: "Ada Lovelace",
		id: "INV-1001",
		status: "paid",
	},
	{
		amount: "$128.50",
		customer: "Grace Hopper",
		id: "INV-1002",
		status: "paid",
	},
];

export function billingInvoiceById(invoiceId: unknown): BillingInvoice | null {
	return (
		billingInvoices.find(
			(invoice) =>
				invoice.id.toLowerCase() === String(invoiceId ?? "").toLowerCase(),
		) ?? null
	);
}

export function isBillingDynamicToolRequest(
	request: ServerRequest,
): request is Extract<ServerRequest, { method: "item/tool/call" }> {
	return (
		request.method === "item/tool/call" &&
		request.params.namespace === "billing"
	);
}

export function resolveRefundInvoiceRequest(
	request: Extract<ServerRequest, { method: "item/tool/call" }>,
): DynamicToolCallResponse {
	const args = objectArguments(request.params.arguments);
	const invoice = billingInvoiceById(args.invoiceId);
	if (!invoice) {
		return textToolResponse(
			`No sample invoice was found for ${String(args.invoiceId ?? "unknown")}.`,
			false,
		);
	}

	const reason = String(args.reason ?? "No reason provided.");
	return textToolResponse(
		JSON.stringify(
			{
				refund: {
					amount: invoice.amount,
					customer: invoice.customer,
					invoiceId: invoice.id,
					reason,
					refundId: `rf_${invoice.id.toLowerCase().replaceAll("-", "_")}`,
					status: "approved",
				},
			},
			null,
			2,
		),
		true,
	);
}

export function objectArguments(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function textToolResponse(
	text: string,
	success: boolean,
): DynamicToolCallResponse {
	return {
		contentItems: [{ type: "inputText", text }],
		success,
	};
}
