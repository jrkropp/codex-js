export interface ComposerImageAttachment {
	id: string;
	file: File;
	name: string;
	type: string;
	size: number;
	previewUrl: string | null;
}

export interface ExpandedImageItem {
	src: string;
	name: string;
}

export interface ExpandedImagePreview {
	images: ExpandedImageItem[];
	index: number;
}

export interface PersistedComposerDraftImageAttachment {
	id: string;
	name: string;
	type: string;
	size: number;
	dataUrl: string;
}

export interface ComposerImageValidationResult {
	accepted: File[];
	error: string | null;
}

export const WORKSPACE_CHAT_MAX_IMAGE_ATTACHMENTS = 8;
export const WORKSPACE_CHAT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const imageSizeLimitLabel = `${Math.round(WORKSPACE_CHAT_MAX_IMAGE_BYTES / (1024 * 1024))}MB`;
const acceptedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isAcceptedComposerImageFile(file: File): boolean {
	return acceptedImageTypes.has(file.type);
}

export function validateComposerImageFiles(input: {
	currentCount?: number;
	files: Iterable<File>;
	maxCount?: number;
	maxSizeBytes?: number;
}): ComposerImageValidationResult {
	const maxCount = input.maxCount ?? WORKSPACE_CHAT_MAX_IMAGE_ATTACHMENTS;
	const maxSizeBytes = input.maxSizeBytes ?? WORKSPACE_CHAT_MAX_IMAGE_BYTES;
	let nextCount = input.currentCount ?? 0;
	let error: string | null = null;
	const accepted: File[] = [];

	for (const file of input.files) {
		if (!isAcceptedComposerImageFile(file)) {
			error = `Unsupported file type for '${file.name || "file"}'. Please attach PNG, JPEG, or WebP images.`;
			continue;
		}
		if (file.size > maxSizeBytes) {
			error = `'${file.name || "image"}' exceeds the ${imageSizeLimitLabel} attachment limit.`;
			continue;
		}
		if (nextCount >= maxCount) {
			error = `You can attach up to ${maxCount} images per message.`;
			break;
		}
		accepted.push(file);
		nextCount += 1;
	}

	return { accepted, error };
}

export function createComposerImageAttachments(
	files: Iterable<File>,
	options: {
		createId?: () => string;
		createObjectURL?: (file: File) => string;
	} = {},
): ComposerImageAttachment[] {
	const createId = options.createId ?? defaultAttachmentId;
	const createObjectURL =
		options.createObjectURL ??
		(typeof URL !== "undefined" ? URL.createObjectURL.bind(URL) : null);

	return Array.from(files)
		.filter(isAcceptedComposerImageFile)
		.map((file) => ({
			id: createId(),
			file,
			name: file.name,
			type: file.type,
			size: file.size,
			previewUrl: createObjectURL ? createObjectURL(file) : null,
		}));
}

export async function persistComposerDraftAttachments(
	attachments: Iterable<ComposerImageAttachment>,
	readFileAsDataUrl: (file: File) => Promise<string> = defaultReadFileAsDataUrl,
): Promise<PersistedComposerDraftImageAttachment[]> {
	const persisted: PersistedComposerDraftImageAttachment[] = [];
	for (const attachment of attachments) {
		persisted.push({
			id: attachment.id,
			name: attachment.name,
			type: attachment.type,
			size: attachment.size,
			dataUrl: await readFileAsDataUrl(attachment.file),
		});
	}
	return persisted;
}

export function restoreComposerDraftAttachments(
	attachments: Iterable<PersistedComposerDraftImageAttachment>,
	options: {
		createObjectURL?: (file: File) => string;
	} = {},
): ComposerImageAttachment[] {
	const createObjectURL =
		options.createObjectURL ??
		(typeof URL !== "undefined" ? URL.createObjectURL.bind(URL) : null);

	return Array.from(attachments).flatMap((attachment) => {
		const file = fileFromDataUrl(attachment);
		if (!file) {
			return [];
		}
		return [
			{
				id: attachment.id,
				file,
				name: attachment.name,
				type: attachment.type,
				size: attachment.size,
				previewUrl: createObjectURL ? createObjectURL(file) : attachment.dataUrl,
			},
		];
	});
}

export function revokeComposerImageAttachments(
	attachments: Iterable<ComposerImageAttachment>,
	revokeObjectURL: (url: string) => void =
		typeof URL !== "undefined" ? URL.revokeObjectURL.bind(URL) : () => undefined,
) {
	for (const attachment of attachments) {
		if (attachment.previewUrl) {
			revokeObjectURL(attachment.previewUrl);
		}
	}
}

export function buildExpandedImagePreview(
	attachments: ReadonlyArray<ComposerImageAttachment>,
	selectedAttachmentId: string,
): ExpandedImagePreview | null {
	const previewable = attachments.flatMap((attachment) =>
		attachment.previewUrl
			? [
					{
						id: attachment.id,
						src: attachment.previewUrl,
						name: attachment.name,
					},
				]
			: [],
	);
	if (previewable.length === 0) {
		return null;
	}

	const selectedIndex = previewable.findIndex(
		(attachment) => attachment.id === selectedAttachmentId,
	);
	if (selectedIndex < 0) {
		return null;
	}

	return {
		images: previewable.map((attachment) => ({
			src: attachment.src,
			name: attachment.name,
		})),
		index: selectedIndex,
	};
}

function defaultAttachmentId() {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultReadFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener("load", () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}
			reject(new Error("Could not read image data."));
		});
		reader.addEventListener("error", () => {
			reject(reader.error ?? new Error("Could not read image data."));
		});
		reader.readAsDataURL(file);
	});
}

function fileFromDataUrl(
	attachment: PersistedComposerDraftImageAttachment,
): File | null {
	const commaIndex = attachment.dataUrl.indexOf(",");
	if (commaIndex < 0) {
		return null;
	}
	const base64 = attachment.dataUrl.slice(commaIndex + 1);
	try {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		return new File([bytes], attachment.name || "image", {
			type: attachment.type || "image/png",
		});
	} catch {
		return null;
	}
}
