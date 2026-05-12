import {
	Fragment,
	createElement,
	type ComponentProps,
	type ReactNode,
} from "react";

import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "../shadcn/ui/sidebar";

export type CodexChatSidebarProps = ComponentProps<typeof Sidebar>;

export function CodexChatSidebar(props: CodexChatSidebarProps) {
	return createElement(Sidebar, props);
}

export type CodexChatLayoutProps = {
	children: ReactNode;
	sidebar?: ReactNode;
	side?: CodexChatSidebarProps["side"];
	collapsible?: CodexChatSidebarProps["collapsible"];
	defaultOpen?: ComponentProps<typeof SidebarProvider>["defaultOpen"];
	open?: ComponentProps<typeof SidebarProvider>["open"];
	onOpenChange?: ComponentProps<typeof SidebarProvider>["onOpenChange"];
	className?: ComponentProps<typeof SidebarProvider>["className"];
};

export function CodexChatLayout({
	children,
	className,
	collapsible,
	defaultOpen,
	onOpenChange,
	open,
	side,
	sidebar,
}: CodexChatLayoutProps) {
	if (!sidebar) {
		return createElement(Fragment, null, children);
	}

	return createElement(
		SidebarProvider,
		{
			className,
			defaultOpen,
			onOpenChange,
			open,
		},
		createElement(CodexChatSidebar, { collapsible, side }, sidebar),
		createElement(SidebarInset, null, children),
	);
}
