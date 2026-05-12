export type ManagedFeature = {
	name: string;
	enabled: boolean;
	source?: string | null;
};

export type ManagedFeatures = Record<string, ManagedFeature>;

export function emptyManagedFeatures(): ManagedFeatures {
	return {};
}
