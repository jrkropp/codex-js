import { memo } from "react";

export const ComposerPlanFollowUpBanner = memo(function ComposerPlanFollowUpBanner({
	planTitle,
}: {
	planTitle: string | null;
}) {
	return (
		<div className="px-4 py-3.5 sm:px-5 sm:py-4">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-sm uppercase tracking-[0.2em]">Plan ready</span>
				{planTitle ? (
					<span className="min-w-0 flex-1 truncate font-medium text-sm">
						{planTitle}
					</span>
				) : null}
			</div>
		</div>
	);
});
