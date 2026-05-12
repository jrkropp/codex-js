import type { RateLimitSnapshot, RateLimitWindow } from "../../core/src";

export function parseAllRateLimits(headers: Headers): RateLimitSnapshot[] {
	const snapshots: RateLimitSnapshot[] = [];
	const defaultSnapshot = parseRateLimitForLimit(headers, null);
	if (defaultSnapshot) {
		snapshots.push(defaultSnapshot);
	}

	const limitIds = new Set<string>();
	for (const key of headers.keys()) {
		const limitId = headerNameToLimitId(key.toLowerCase());
		if (limitId && limitId !== "codex") {
			limitIds.add(limitId);
		}
	}

	for (const limitId of [...limitIds].sort()) {
		const snapshot = parseRateLimitForLimit(headers, limitId);
		if (
			snapshot &&
			(snapshot.primary || snapshot.secondary || snapshot.credits)
		) {
			snapshots.push(snapshot);
		}
	}

	return snapshots;
}

export function parseRateLimitEventPayload(
	event: Record<string, unknown>,
): RateLimitSnapshot | null {
	if (event.type !== "codex.rate_limits") {
		return null;
	}
	const details = isRecord(event.rate_limits) ? event.rate_limits : null;
	const primary = isRecord(details?.primary)
		? rateLimitEventWindow(details.primary)
		: null;
	const secondary = isRecord(details?.secondary)
		? rateLimitEventWindow(details.secondary)
		: null;
	const credits = isRecord(event.credits)
		? ({ ...event.credits } as Record<string, unknown>)
		: isRecord(event.rate_limits) && isRecord(event.rate_limits.credits)
			? ({ ...event.rate_limits.credits } as Record<string, unknown>)
			: null;
	const limitId =
		typeof event.metered_limit_name === "string"
			? normalizeLimitId(event.metered_limit_name)
			: typeof event.limit_name === "string"
				? normalizeLimitId(event.limit_name)
				: typeof event.limit_id === "string"
					? normalizeLimitId(event.limit_id)
					: "codex";

	return {
		limit_id: limitId,
		primary,
		secondary,
		credits,
		plan_type:
			typeof event.plan_type === "string"
				? event.plan_type
				: isRecord(event.rate_limits) &&
					  typeof event.rate_limits.plan_type === "string"
					? event.rate_limits.plan_type
					: null,
	};
}

function parseRateLimitForLimit(
	headers: Headers,
	limitId: string | null,
): RateLimitSnapshot | null {
	const normalizedLimit = (limitId?.trim() || "codex")
		.toLowerCase()
		.replaceAll("_", "-");
	const prefix = `x-${normalizedLimit}`;
	const primary = parseRateLimitWindow(
		headers,
		`${prefix}-primary-used-percent`,
		`${prefix}-primary-window-minutes`,
		`${prefix}-primary-reset-at`,
	);
	const secondary = parseRateLimitWindow(
		headers,
		`${prefix}-secondary-used-percent`,
		`${prefix}-secondary-window-minutes`,
		`${prefix}-secondary-reset-at`,
	);
	const credits = parseCreditsSnapshot(headers);
	const limitName = stringHeader(headers, `${prefix}-limit-name`);

	return {
		limit_id: normalizeLimitId(normalizedLimit),
		...(limitName ? { limit_name: limitName } : {}),
		primary,
		secondary,
		credits,
		plan_type: null,
	};
}

function parseRateLimitWindow(
	headers: Headers,
	usedPercentHeader: string,
	windowMinutesHeader: string,
	resetsAtHeader: string,
): RateLimitWindow | null {
	const usedPercent = numberHeader(headers, usedPercentHeader);
	if (usedPercent === null) {
		return null;
	}
	const windowMinutes = numberHeader(headers, windowMinutesHeader);
	const resetsAt = numberHeader(headers, resetsAtHeader);
	const hasData =
		usedPercent !== 0 ||
		(windowMinutes !== null && windowMinutes !== 0) ||
		resetsAt !== null;
	if (!hasData) {
		return null;
	}
	return {
		used_percent: usedPercent,
		window_minutes: windowMinutes,
		resets_at: resetsAt,
	};
}

function rateLimitEventWindow(value: Record<string, unknown>): RateLimitWindow {
	return {
		...value,
		...(numberField(value.used_percent) !== null
			? { used_percent: numberField(value.used_percent) }
			: {}),
		...(numberField(value.window_minutes) !== null
			? { window_minutes: numberField(value.window_minutes) }
			: {}),
		...(numberField(value.reset_at) !== null ||
		numberField(value.resets_at) !== null
			? { resets_at: numberField(value.reset_at) ?? numberField(value.resets_at) }
			: {}),
	};
}

function parseCreditsSnapshot(headers: Headers): Record<string, unknown> | null {
	const hasCredits = booleanHeader(headers, "x-codex-credits-has-credits");
	const unlimited = booleanHeader(headers, "x-codex-credits-unlimited");
	if (hasCredits === null || unlimited === null) {
		return null;
	}
	const balance = stringHeader(headers, "x-codex-credits-balance");
	return {
		has_credits: hasCredits,
		unlimited,
		...(balance ? { balance } : {}),
	};
}

function headerNameToLimitId(headerName: string): string | null {
	const suffix = "-primary-used-percent";
	const prefix = headerName.endsWith(suffix)
		? headerName.slice(0, -suffix.length)
		: null;
	const limit = prefix?.startsWith("x-") ? prefix.slice(2) : null;
	return limit ? normalizeLimitId(limit) : null;
}

function normalizeLimitId(value: string): string {
	return value.trim().toLowerCase().replaceAll("-", "_");
}

function stringHeader(headers: Headers, name: string): string | null {
	const value = headers.get(name)?.trim();
	return value || null;
}

function numberHeader(headers: Headers, name: string): number | null {
	const raw = headers.get(name);
	if (!raw) {
		return null;
	}
	const parsed = Number.parseFloat(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

function booleanHeader(headers: Headers, name: string): boolean | null {
	const raw = headers.get(name);
	if (!raw) {
		return null;
	}
	if (raw === "1" || raw.toLowerCase() === "true") {
		return true;
	}
	if (raw === "0" || raw.toLowerCase() === "false") {
		return false;
	}
	return null;
}

function numberField(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
