import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";

import { Button } from "../ui/button";

import type { ExpandedImagePreview } from "./composer-image-attachments";

export const ExpandedImageDialog = memo(function ExpandedImageDialog({
	preview: initialPreview,
	onClose,
}: {
	preview: ExpandedImagePreview;
	onClose: () => void;
}) {
	const [preview, setPreview] = useState(initialPreview);

	useEffect(() => {
		setPreview(initialPreview);
	}, [initialPreview]);

	const navigateImage = useCallback((direction: -1 | 1) => {
		setPreview((current) => {
			if (current.images.length <= 1) {
				return current;
			}
			const nextIndex =
				(current.index + direction + current.images.length) %
				current.images.length;
			return nextIndex === current.index
				? current
				: { ...current, index: nextIndex };
		});
	}, []);

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				onClose();
				return;
			}
			if (preview.images.length <= 1) {
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				event.stopPropagation();
				navigateImage(-1);
				return;
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				event.stopPropagation();
				navigateImage(1);
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [navigateImage, onClose, preview.images.length]);

	const item = preview.images[preview.index];
	if (!item) {
		return null;
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/75 px-4 py-6"
			role="dialog"
			aria-modal="true"
			aria-label="Expanded image preview"
		>
			<button
				type="button"
				className="absolute inset-0 z-0 cursor-zoom-out"
				aria-label="Close image preview"
				onClick={onClose}
			/>
			{preview.images.length > 1 ? (
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="absolute left-2 top-1/2 z-20 -translate-y-1/2 text-background/90 hover:bg-background/10 hover:text-background sm:left-6"
					aria-label="Previous image"
					onClick={() => navigateImage(-1)}
				>
					<ChevronLeftIcon className="size-5" aria-hidden="true" />
				</Button>
			) : null}
			<div className="relative isolate z-10 max-h-[92vh] max-w-[92vw]">
				<Button
					type="button"
					size="icon-xs"
					variant="ghost"
					className="absolute right-2 top-2 bg-background/80 hover:bg-background/90"
					aria-label="Close image preview"
					onClick={onClose}
				>
					<XIcon aria-hidden="true" />
				</Button>
				<img
					src={item.src}
					alt={item.name}
					className="max-h-[86vh] max-w-[92vw] select-none rounded-lg border border-border/70 bg-background object-contain shadow-2xl"
					draggable={false}
				/>
				<p className="mt-2 max-w-[92vw] truncate text-center text-muted-foreground/80 text-xs">
					{item.name}
					{preview.images.length > 1
						? ` (${preview.index + 1}/${preview.images.length})`
						: ""}
				</p>
			</div>
			{preview.images.length > 1 ? (
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="absolute right-2 top-1/2 z-20 -translate-y-1/2 text-background/90 hover:bg-background/10 hover:text-background sm:right-6"
					aria-label="Next image"
					onClick={() => navigateImage(1)}
				>
					<ChevronRightIcon className="size-5" aria-hidden="true" />
				</Button>
			) : null}
		</div>
	);
});
