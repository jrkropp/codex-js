export type RequestId = string | number;

export type ElicitationAction = "accept" | "decline" | "cancel";

export type ElicitationResponse = {
	action: ElicitationAction;
	content?: unknown;
	meta?: unknown;
};

export type CreateElicitationRequestParams =
	| {
			type: "form";
			meta?: unknown;
			message: string;
			requested_schema: {
				properties?: Record<string, unknown>;
				[key: string]: unknown;
			};
	  }
	| {
			type: "url";
			meta?: unknown;
			message: string;
			url: string;
			elicitation_id?: string | null;
	  };

export type ElicitationRequestEvent = {
	id: "mcp_elicitation_request";
	msg: {
		type: "elicitation_request";
		turn_id: null;
		server_name: string;
		id: RequestId;
		request:
			| {
					type: "form";
					meta?: unknown;
					message: string;
					requested_schema: unknown;
			  }
			| {
					type: "url";
					meta?: unknown;
					message: string;
					url: string;
					elicitation_id?: string | null;
			  };
	};
};

export type ElicitationReviewRequest = {
	server_name: string;
	request_id: RequestId;
	elicitation: CreateElicitationRequestParams;
};

export type ElicitationReviewer = {
	review(
		request: ElicitationReviewRequest,
	): Promise<ElicitationResponse | null | undefined>;
};

export type ElicitationReviewerHandle = ElicitationReviewer;

export type ElicitationEventSink =
	| ((event: ElicitationRequestEvent) => Promise<void> | void)
	| {
			send(event: ElicitationRequestEvent): Promise<void> | void;
	  };

export type SendElicitation = (
	id: RequestId,
	elicitation: CreateElicitationRequestParams,
) => Promise<ElicitationResponse>;

export class ElicitationRequestManager {
	private readonly requests = new Map<
		string,
		(response: ElicitationResponse) => void
	>();
	private approval_policy: unknown;
	private permission_profile: unknown;
	private auto_deny_value = false;

	constructor(
		approval_policy: unknown,
		permission_profile: unknown,
		private readonly reviewer: ElicitationReviewerHandle | null = null,
	) {
		this.approval_policy = approval_policy;
		this.permission_profile = permission_profile;
	}

	auto_deny(): boolean {
		return this.auto_deny_value;
	}

	set_auto_deny(auto_deny: boolean): void {
		this.auto_deny_value = auto_deny;
	}

	set_approval_policy(approval_policy: unknown): void {
		this.approval_policy = approval_policy;
	}

	set_permission_profile(permission_profile: unknown): void {
		this.permission_profile = permission_profile;
	}

	async resolve(
		server_name: string,
		id: RequestId,
		response: ElicitationResponse,
	): Promise<void> {
		const key = request_key(server_name, id);
		const resolve = this.requests.get(key);
		if (!resolve) {
			throw new Error("elicitation request not found");
		}
		this.requests.delete(key);
		resolve(response);
	}

	make_sender(
		server_name: string,
		tx_event: ElicitationEventSink,
	): SendElicitation {
		return async (id, elicitation) => {
			if (this.auto_deny()) {
				return decline_response();
			}
			if (
				mcp_permission_prompt_is_auto_approved(
					this.approval_policy,
					this.permission_profile,
					{},
				) &&
				can_auto_accept_elicitation(elicitation)
			) {
				return {
					action: "accept",
					content: {},
					meta: null,
				};
			}
			if (elicitation_is_rejected_by_policy(this.approval_policy)) {
				return decline_response();
			}
			const reviewed = await this.reviewer?.review({
				server_name,
				request_id: id,
				elicitation,
			});
			if (reviewed) {
				return reviewed;
			}

			const response = new Promise<ElicitationResponse>((resolve) => {
				this.requests.set(request_key(server_name, id), resolve);
			});
			await send_event(tx_event, {
				id: "mcp_elicitation_request",
				msg: {
					type: "elicitation_request",
					turn_id: null,
					server_name,
					id,
					request: elicitation_request_to_event_request(elicitation),
				},
			});
			return response;
		};
	}
}

export function elicitation_is_rejected_by_policy(
	approval_policy: unknown,
): boolean {
	if (approval_policy === "never" || approval_policy === "Never") {
		return true;
	}
	const granular = granular_approval_config(approval_policy);
	if (granular) {
		return granular.mcp_elicitations === false;
	}
	return false;
}

export function can_auto_accept_elicitation(
	elicitation: CreateElicitationRequestParams,
): boolean {
	return (
		elicitation.type === "form" &&
		Object.keys(elicitation.requested_schema.properties ?? {}).length === 0
	);
}

export type McpPermissionPromptAutoApproveContext = {
	approvals_reviewer?: unknown;
	tool_approval_mode?: string | null;
};

export function mcp_permission_prompt_is_auto_approved(
	approval_policy: unknown,
	permission_profile: unknown,
	context: McpPermissionPromptAutoApproveContext = {},
): boolean {
	if (context.tool_approval_mode === "approve") {
		return true;
	}
	if (approval_policy !== "never" && approval_policy !== "Never") {
		return false;
	}
	const profile = as_record(permission_profile);
	const type = String(profile?.type ?? profile?.mode ?? "");
	if (type === "disabled" || type === "external") {
		return true;
	}
	const fileSystem = as_record(profile?.file_system);
	const entries = Array.isArray(fileSystem?.entries) ? fileSystem.entries : [];
	return entries.some((entry) => {
		const record = as_record(entry);
		const path = as_record(record?.path);
		return (
			record?.access === "read-write" &&
			(path?.value === "root" || path?.type === "root")
		);
	});
}

function elicitation_request_to_event_request(
	elicitation: CreateElicitationRequestParams,
): ElicitationRequestEvent["msg"]["request"] {
	if (elicitation.type === "form") {
		return {
			type: "form",
			meta: elicitation.meta,
			message: elicitation.message,
			requested_schema: elicitation.requested_schema,
		};
	}
	return {
		type: "url",
		meta: elicitation.meta,
		message: elicitation.message,
		url: elicitation.url,
		elicitation_id: elicitation.elicitation_id ?? null,
	};
}

async function send_event(
	sink: ElicitationEventSink,
	event: ElicitationRequestEvent,
): Promise<void> {
	if (typeof sink === "function") {
		await sink(event);
		return;
	}
	await sink.send(event);
}

function granular_approval_config(value: unknown): Record<string, unknown> | null {
	const record = as_record(value);
	if (!record) {
		return null;
	}
	if (as_record(record.granular)) {
		return as_record(record.granular);
	}
	return "mcp_elicitations" in record ? record : null;
}

function request_key(server_name: string, id: RequestId): string {
	return `${server_name}\0${String(id)}`;
}

function decline_response(): ElicitationResponse {
	return {
		action: "decline",
		content: null,
		meta: null,
	};
}

function as_record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}
