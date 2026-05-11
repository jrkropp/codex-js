export type NetworkProxySpec = {
	mode: "disabled" | "default" | "custom";
	url?: string | null;
};

export function defaultNetworkProxySpec(): NetworkProxySpec {
	return { mode: "disabled", url: null };
}
