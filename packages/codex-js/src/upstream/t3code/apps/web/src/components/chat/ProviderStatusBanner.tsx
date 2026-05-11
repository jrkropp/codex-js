import { CircleAlertIcon } from "lucide-react";
import { memo } from "react";

import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

export type ProviderStatus = {
	displayName?: string | null;
	driver?: string | null;
	message?: string | null;
	status: "disabled" | "error" | "limited" | "ready" | "warning";
};

export const ProviderStatusBanner = memo(function ProviderStatusBanner({
	status,
}: {
	status: ProviderStatus | null;
}) {
	if (!status || status.status === "ready" || status.status === "disabled") {
		return null;
	}

	const providerLabel =
		status.displayName?.trim() ||
		(status.driver ? formatProviderDriverKindLabel(status.driver) : "Codex");
	const defaultMessage =
		status.status === "error"
			? `${providerLabel} provider is unavailable.`
			: `${providerLabel} provider has limited availability.`;
	const title = `${providerLabel} provider status`;

	return (
		<div className="mx-auto max-w-3xl pt-3">
			<Alert variant={status.status === "error" ? "destructive" : "default"}>
				<CircleAlertIcon aria-hidden="true" />
				<AlertTitle>{title}</AlertTitle>
				<AlertDescription
					className="line-clamp-3"
					title={status.message ?? defaultMessage}
				>
					{status.message ?? defaultMessage}
				</AlertDescription>
			</Alert>
		</div>
	);
});

function formatProviderDriverKindLabel(driver: string): string {
	return driver
		.split(/[-_\s]+/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}
