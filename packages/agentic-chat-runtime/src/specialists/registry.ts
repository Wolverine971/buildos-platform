// packages/agentic-chat-runtime/src/specialists/registry.ts
/** A definition describes capabilities; only the host may authorize and execute them. */
export type SpecialistDefinitionRefV1 = Readonly<{ id: string; version: number }>;

export type SpecialistDefinitionV1 = Readonly<{
	schemaVersion: 'specialist_definition_v1';
	id: string;
	version: number;
	label: string;
	description: string;
	expertise: readonly string[];
	instructions: Readonly<{ system: string; defaultAssignment: string }>;
	knowledge: readonly (
		| Readonly<{
				id: string;
				version: number;
				source: 'prepared_project_context';
		  }>
		| Readonly<{
				id: 'reference_packet';
				version: 1;
				source: 'pinned_reference_packet_v1';
				contentHash: string;
		  }>
	)[];
	/** Versioned contracts resolved by the host's input/output validators. */
	inputContract: string;
	outputContract: string;
	capabilities: Readonly<{
		domainAccess: 'read_only';
		allowedToolIds: readonly string[];
		allowedWorkflowIds: readonly string[];
	}>;
	modelPolicy: Readonly<{
		id: string;
		version: number;
		primaryModel: string;
		fallbackModels: readonly string[];
		/** The currently supported worker provider contract. */
		reasoningEffort: 'low';
	}>;
	limits: Readonly<{
		maxOutputTokens: number;
		maxAttempts: number;
		requestTimeoutMs: number;
		retryMinRemainingMs: number;
	}>;
	/** Shared workflow budget, not a separate allowance for each specialist. */
	budgetPolicy: Readonly<{
		scope: 'workflow';
		id: string;
		maxSpendMicroUsd: number;
		wholeRunLifetimeMs: number;
	}>;
}>;

export type SpecialistRegistryV1 = Readonly<{
	list(): readonly SpecialistDefinitionV1[];
	/** Exact versions only. Never resolves "latest" during execution or recovery. */
	resolve(ref: SpecialistDefinitionRefV1): SpecialistDefinitionV1;
}>;

const ID = /^[a-z][a-z0-9_]{0,79}$/;

/** Code-owned definitions only; this is not a parser for user-authored configuration. */
export function createSpecialistRegistryV1(
	definitions: readonly SpecialistDefinitionV1[]
): SpecialistRegistryV1 {
	const versions = new Map<string, SpecialistDefinitionV1>();
	for (const definition of definitions) {
		if (
			definition.schemaVersion !== 'specialist_definition_v1' ||
			!ID.test(definition.id) ||
			!Number.isSafeInteger(definition.version) ||
			definition.version < 1 ||
			!definition.label.trim() ||
			!definition.description.trim() ||
			!definition.instructions.system.trim() ||
			!definition.instructions.defaultAssignment.trim() ||
			!definition.inputContract.trim() ||
			!definition.outputContract.trim() ||
			!definition.expertise.length ||
			definition.expertise.some((item) => !item.trim()) ||
			Object.values(definition.limits).some(
				(value) => !Number.isSafeInteger(value) || value < 1
			) ||
			!Number.isSafeInteger(definition.budgetPolicy.maxSpendMicroUsd) ||
			definition.budgetPolicy.maxSpendMicroUsd < 1 ||
			!Number.isSafeInteger(definition.budgetPolicy.wholeRunLifetimeMs) ||
			definition.budgetPolicy.wholeRunLifetimeMs < 1
		)
			throw new Error(
				`Invalid specialist definition: ${definition.id}@${definition.version}`
			);
		const key = referenceKey(definition);
		if (versions.has(key)) throw new Error(`Duplicate specialist definition: ${key}`);
		// Copy before freezing: a caller cannot later change an accepted definition through
		// an array/object alias, and registering it does not freeze the caller's object.
		versions.set(key, freezeDefinition(structuredClone(definition)));
	}
	const catalog = Object.freeze([...versions.values()]);
	return Object.freeze({
		list: () => catalog,
		resolve(ref: SpecialistDefinitionRefV1) {
			const definition = versions.get(referenceKey(ref));
			if (!definition) throw new Error(`Unknown specialist definition: ${referenceKey(ref)}`);
			return definition;
		}
	});
}

function referenceKey(ref: SpecialistDefinitionRefV1): string {
	return `${ref.id}@${ref.version}`;
}

function freezeDefinition<T>(value: T): T {
	if (value !== null && typeof value === 'object') {
		for (const child of Object.values(value)) freezeDefinition(child);
		Object.freeze(value);
	}
	return value;
}
