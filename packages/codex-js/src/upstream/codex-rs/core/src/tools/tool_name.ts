export type ToolNameInput =
	| ToolName
	| string
	| {
			namespace?: string | null;
			name: string;
	  };

export class ToolName {
	private constructor(
		readonly namespace: string | null,
		readonly name: string,
	) {}

	static plain(name: string): ToolName {
		return new ToolName(null, name);
	}

	static namespaced(namespace: string, name: string): ToolName {
		return new ToolName(namespace, name);
	}

	static new(namespace: string | null | undefined, name: string): ToolName {
		return namespace ? ToolName.namespaced(namespace, name) : ToolName.plain(name);
	}

	static from(input: ToolNameInput): ToolName {
		if (input instanceof ToolName) {
			return input;
		}

		if (typeof input === "string") {
			const separator = input.indexOf(".");
			return separator === -1
				? ToolName.plain(input)
				: ToolName.namespaced(
						input.slice(0, separator),
						input.slice(separator + 1),
					);
		}

		return ToolName.new(input.namespace, input.name);
	}

	display(): string {
		return this.namespace ? `${this.namespace}.${this.name}` : this.name;
	}

	key(): string {
		return this.display();
	}

	equals(other: ToolNameInput): boolean {
		return this.key() === ToolName.from(other).key();
	}

	toJSON(): string {
		return this.display();
	}
}
