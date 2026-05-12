export const AuthMode = {
	ApiKey: "apiKey",
	Chatgpt: "chatgpt",
} as const;

export const CODEX_CHATGPT_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const CODEX_CHATGPT_OAUTH_ISSUER = "https://auth.openai.com";
export const CODEX_CHATGPT_OAUTH_SCOPE =
	"openid profile email offline_access api.connectors.read api.connectors.invoke";
export const CODEX_CHATGPT_OAUTH_PRIMARY_PORT = 1455;
export const CODEX_CHATGPT_OAUTH_FALLBACK_PORT = 1457;
export const CODEX_CHATGPT_OAUTH_CALLBACK_PATH = "/auth/callback";
export const CODEX_CHATGPT_OAUTH_ORIGINATOR = "codex_cli_rs";

export type AuthMode = (typeof AuthMode)[keyof typeof AuthMode];

export type PlanType =
	| "free"
	| "plus"
	| "pro"
	| "team"
	| "enterprise"
	| "edu"
	| "unknown";

export type TokenData = {
	access_token: string;
	refresh_token: string;
	id_token: string;
	account_id?: string | null;
	expires_at?: number | null;
};

export type AuthDotJson = {
	auth_mode?: AuthMode | null;
	openai_api_key?: string | null;
	tokens?: TokenData | null;
	last_refresh?: string | null;
};

export type CodexAuth =
	| {
			type: typeof AuthMode.ApiKey;
			api_key: string;
	  }
	| {
			type: typeof AuthMode.Chatgpt;
			auth: AuthDotJson;
			account_id?: string | null;
			email?: string | null;
			plan_type?: PlanType | null;
	  };

export type ProviderAccount =
	| {
			type: typeof AuthMode.ApiKey;
	  }
	| {
			type: typeof AuthMode.Chatgpt;
			email: string;
			plan_type: PlanType;
	  };

export type ProviderAccountState = {
	account: ProviderAccount | null;
	requires_openai_auth: boolean;
};

export type GetAccountResponse = ProviderAccountState;

export type ChatgptOAuthTokenExchangeRequest = {
	code: string;
	redirect_uri: string;
	code_verifier: string;
};

export type ChatgptOAuthTokenExchangeResponse = {
	credential_jwe: string;
	account: ProviderAccountState;
};

export function resolvedAuthMode(auth: AuthDotJson): AuthMode {
	if (auth.auth_mode) {
		return auth.auth_mode;
	}

	if (auth.openai_api_key) {
		return AuthMode.ApiKey;
	}

	return AuthMode.Chatgpt;
}

export function parseJwtPayload(token: string): Record<string, unknown> {
	const [, payload] = token.split(".");
	if (!payload) {
		return {};
	}

	try {
		const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized.padEnd(
			normalized.length + ((4 - (normalized.length % 4)) % 4),
			"=",
		);
		const decoded = atob(padded);
		const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
		return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
	} catch {
		return {};
	}
}

export function openAiAuthClaims(token: string): Record<string, unknown> {
	const payload = parseJwtPayload(token);
	const nested = payload["https://api.openai.com/auth"];

	if (nested && typeof nested === "object" && !Array.isArray(nested)) {
		return nested as Record<string, unknown>;
	}

	return payload;
}

export function normalizePlanType(value: unknown): PlanType {
	if (typeof value !== "string") {
		return "unknown";
	}

	const normalized = value.toLowerCase();
	if (
		normalized === "free" ||
		normalized === "plus" ||
		normalized === "pro" ||
		normalized === "team" ||
		normalized === "enterprise" ||
		normalized === "edu"
	) {
		return normalized;
	}

	return "unknown";
}

export function chatgptAuthFromAuthDotJson(auth: AuthDotJson): CodexAuth {
	const tokens = auth.tokens;
	const claims = tokens?.id_token ? openAiAuthClaims(tokens.id_token) : {};
	const email = typeof claims.email === "string" ? claims.email : null;
	const accountId =
		(typeof claims.chatgpt_account_id === "string"
			? claims.chatgpt_account_id
			: tokens?.account_id) ?? null;
	const planType = normalizePlanType(claims.chatgpt_plan_type);

	return {
		type: AuthMode.Chatgpt,
		auth,
		account_id: accountId,
		email,
		plan_type: planType,
	};
}

export function codexAuthToAccountState(auth: CodexAuth | null): ProviderAccountState {
	if (!auth) {
		return { account: null, requires_openai_auth: true };
	}

	if (auth.type === AuthMode.ApiKey) {
		return {
			account: { type: AuthMode.ApiKey },
			requires_openai_auth: true,
		};
	}

	return {
		account: {
			type: AuthMode.Chatgpt,
			email: auth.email ?? "",
			plan_type: auth.plan_type ?? "unknown",
		},
		requires_openai_auth: true,
	};
}

export function authDotJsonToOpenAiApiKey(auth: AuthDotJson): string | null {
	if (auth.openai_api_key?.trim()) {
		return auth.openai_api_key.trim();
	}

	return null;
}

export function authDotJsonToBearerToken(auth: AuthDotJson): string | null {
	return authDotJsonToOpenAiApiKey(auth) ?? auth.tokens?.access_token?.trim() ?? null;
}
