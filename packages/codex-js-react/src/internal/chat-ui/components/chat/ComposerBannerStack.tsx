import {
	AlertCircleIcon,
	CheckCircleIcon,
	InfoIcon,
	TriangleAlertIcon,
	XIcon,
} from "lucide-react";
import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";

import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "../ui/alert";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

const DISMISS_TRANSITION_MS = 220;
const frontExitStyle = {
	opacity: 0,
	transform: "translate3d(0, 4rem, 0)",
} satisfies CSSProperties;
const stackedExitStyle = {
	opacity: 0,
	transform: "translate3d(0, 7rem, 0)",
} satisfies CSSProperties;
const restingStyle = {
	opacity: 1,
	transform: "translate3d(0, 0, 0)",
} satisfies CSSProperties;
const exitTransitionStyle = {
	transition: `transform ${DISMISS_TRANSITION_MS}ms ease-in, opacity ${DISMISS_TRANSITION_MS}ms ease-in`,
	willChange: "transform, opacity",
} satisfies CSSProperties;

export type ComposerBannerStackItem = {
	id: string;
	title: ReactNode;
	description?: ReactNode;
	action?: {
		label: string;
		onClick: () => void;
	};
	actions?: ReactNode;
	dismissLabel?: string;
	icon?: ReactNode;
	onDismiss?: () => void;
	variant?: "error" | "info" | "success" | "warning";
	tone?: "default" | "destructive";
};

export function ComposerBannerStack({
	className,
	items,
}: {
	className?: string;
	items: readonly ComposerBannerStackItem[];
}) {
	const [exitingItemId, setExitingItemId] = useState<string | null>(null);
	const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (dismissTimeoutRef.current) {
				clearTimeout(dismissTimeoutRef.current);
			}
		},
		[],
	);

	if (items.length === 0) {
		return null;
	}

	const frontItem = items[0];
	if (!frontItem) {
		return null;
	}
	const stackedItems = items.slice(1);
	const hasStack = stackedItems.length > 0;
	const showCollapsedStackCap = hasStack && exitingItemId !== frontItem.id;

	const requestDismiss = (item: ComposerBannerStackItem) => {
		if (!item.onDismiss || exitingItemId) {
			return;
		}
		setExitingItemId(item.id);
		if (dismissTimeoutRef.current) {
			clearTimeout(dismissTimeoutRef.current);
		}
		dismissTimeoutRef.current = setTimeout(() => {
			dismissTimeoutRef.current = null;
			setExitingItemId((current) => (current === item.id ? null : current));
			item.onDismiss?.();
		}, DISMISS_TRANSITION_MS);
	};

	return (
		<div className={cn("group/banner-stack mx-auto mb-2 w-full", className)}>
			<div
				className={cn(
					"relative",
					hasStack
						? "group-hover/banner-stack:z-50 group-focus-within/banner-stack:z-50"
						: null,
				)}
			>
				{showCollapsedStackCap ? (
					<div
						className={cn(
							"pointer-events-none absolute inset-x-0 -top-3 z-0 mx-auto h-3 rounded-t-xl border border-b-0 border-border/70 bg-background/95 shadow-md shadow-foreground/5",
							"transition-opacity duration-150 ease-out group-hover/banner-stack:opacity-0 group-focus-within/banner-stack:opacity-0",
						)}
						style={{ width: "96%" }}
						aria-hidden="true"
					/>
				) : null}
				<div
					className={cn(
						"relative z-10",
						exitingItemId === frontItem.id ? "pointer-events-none" : null,
					)}
					style={{
						...exitTransitionStyle,
						...(exitingItemId === frontItem.id ? frontExitStyle : restingStyle),
					}}
				>
					<ComposerBannerStackAlert
						item={frontItem}
						exiting={exitingItemId === frontItem.id}
						onDismissRequest={() => requestDismiss(frontItem)}
					/>
				</div>
				{hasStack ? (
					<div
						className={cn(
							"pointer-events-none absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-20 space-y-2 opacity-0",
							"translate-y-1 transform-gpu transition-[opacity,transform] duration-150 ease-out will-change-[opacity,transform]",
							"group-hover/banner-stack:pointer-events-auto group-hover/banner-stack:translate-y-0 group-hover/banner-stack:opacity-100",
							"group-focus-within/banner-stack:pointer-events-auto group-focus-within/banner-stack:translate-y-0 group-focus-within/banner-stack:opacity-100",
						)}
					>
						{stackedItems.map((item) => (
							<div
								key={item.id}
								className={cn(
									exitingItemId === item.id ? "pointer-events-none" : null,
								)}
								style={{
									...exitTransitionStyle,
									...(exitingItemId === item.id ? stackedExitStyle : restingStyle),
								}}
							>
								<ComposerBannerStackAlert
									item={item}
									exiting={exitingItemId === item.id}
									onDismissRequest={() => requestDismiss(item)}
								/>
							</div>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}

function ComposerBannerStackAlert({
	item,
	exiting,
	onDismissRequest,
}: {
	item: ComposerBannerStackItem;
	exiting: boolean;
	onDismissRequest: () => void;
}) {
	const dismissOnly = item.onDismiss && !item.action && !item.actions;
	const variant = resolveBannerVariant(item);
	const actions =
		item.actions ??
		(item.action ? (
			<Button
				type="button"
				variant="outline"
				size="xs"
				onClick={item.action.onClick}
			>
				{item.action.label}
			</Button>
		) : null);

	return (
		<Alert
			variant={variant === "error" ? "destructive" : "default"}
			className={cn(
				"rounded-xl bg-card/95 shadow-sm shadow-foreground/5",
				variant === "warning" ? "border-warning/30" : null,
				variant === "success" ? "border-success/30" : null,
			)}
		>
			{item.icon ?? <ComposerBannerIcon variant={variant} />}
			<AlertTitle>{item.title}</AlertTitle>
			{item.description ? (
				<AlertDescription className="text-xs">{item.description}</AlertDescription>
			) : null}
			{actions || item.onDismiss ? (
				<AlertAction
					className={cn(
						"flex items-center gap-1.5",
						dismissOnly
							? "max-sm:col-start-3 max-sm:row-start-1 max-sm:mt-0 max-sm:self-start"
							: null,
					)}
				>
					{actions}
					{item.onDismiss ? (
						<Button
							size="icon-xs"
							variant="ghost"
							type="button"
							aria-label={item.dismissLabel ?? "Dismiss warning"}
							disabled={exiting}
							onClick={onDismissRequest}
						>
							<XIcon className="size-3.5" aria-hidden="true" />
						</Button>
					) : null}
				</AlertAction>
			) : null}
		</Alert>
	);
}

function ComposerBannerIcon({
	variant,
}: {
	variant: "error" | "info" | "success" | "warning";
}) {
	const className = "size-4";
	switch (variant) {
		case "error":
			return <AlertCircleIcon aria-hidden="true" className={className} />;
		case "success":
			return <CheckCircleIcon aria-hidden="true" className={className} />;
		case "warning":
			return <TriangleAlertIcon aria-hidden="true" className={className} />;
		case "info":
			return <InfoIcon aria-hidden="true" className={className} />;
	}
}

function resolveBannerVariant(
	item: ComposerBannerStackItem,
): "error" | "info" | "success" | "warning" {
	if (item.variant) {
		return item.variant;
	}
	return item.tone === "destructive" ? "error" : "warning";
}
