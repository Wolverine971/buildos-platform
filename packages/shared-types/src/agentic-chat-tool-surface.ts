// packages/shared-types/src/agentic-chat-tool-surface.ts
import type { ChatToolDefinition } from './chat.types';

export const AGENTIC_CHAT_TOOL_SURFACE_VERSION = 1 as const;
export const AGENTIC_CHAT_TOOL_SURFACE_MAX_TOOLS = 256;
export const AGENTIC_CHAT_TOOL_SURFACE_MAX_BYTES = 512 * 1024;

export type AgenticChatToolSurfaceV1 = {
	version: typeof AGENTIC_CHAT_TOOL_SURFACE_VERSION;
	surfaceProfile: string;
	/** Canonical provider order. Definitions must have the same names in the same order. */
	toolNames: string[];
	definitions: ChatToolDefinition[];
	/** Cache/observability identifier only; the artifact SHA-256 remains authoritative. */
	registryVersion?: string;
	/** Discovery visibility is versioned independently from the stable registry schema. */
	discoveryPolicyVersion?: string;
};

/**
 * Retained artifacts written before V1 have no nested version field. Keep the
 * artifact envelope permissive during the seven-day reader-first rollout; all
 * execution sites must use the decoder below before trusting the value.
 */
export type AgenticChatLegacyToolSurfaceV0 = Record<string, unknown> & { version?: never };
export type AgenticChatToolSurfaceArtifact =
	| AgenticChatToolSurfaceV1
	| AgenticChatLegacyToolSurfaceV0;

export type AgenticChatToolSurfaceDecodeErrorCode =
	| 'invalid_surface'
	| 'unsupported_version'
	| 'invalid_surface_profile'
	| 'invalid_tool_names'
	| 'tool_count_exceeded'
	| 'invalid_definitions'
	| 'invalid_definition'
	| 'duplicate_tool_name'
	| 'name_definition_mismatch'
	| 'invalid_observability_version'
	| 'not_json_compatible'
	| 'surface_too_large';

export type AgenticChatToolSurfaceDecodeResult =
	| {
			ok: true;
			source: 'v1' | 'legacy_v0';
			surface: AgenticChatToolSurfaceV1;
	  }
	| {
			ok: false;
			code: AgenticChatToolSurfaceDecodeErrorCode;
			detail: string;
	  };

export function decodeAgenticChatToolSurfaceV1(
	value: unknown,
	options: { allowLegacy?: boolean } = {}
): AgenticChatToolSurfaceDecodeResult {
	if (!isRecord(value)) {
		return failure('invalid_surface', 'Tool surface must be an object');
	}

	const source = value.version === AGENTIC_CHAT_TOOL_SURFACE_VERSION ? 'v1' : 'legacy_v0';
	if (value.version !== undefined && value.version !== AGENTIC_CHAT_TOOL_SURFACE_VERSION) {
		return failure('unsupported_version', 'Tool surface version is not supported');
	}
	if (source === 'legacy_v0' && options.allowLegacy === false) {
		return failure('unsupported_version', 'Versioned tool surface is required');
	}
	if (!isCanonicalText(value.surfaceProfile, 256)) {
		return failure(
			'invalid_surface_profile',
			'Tool surface profile must be canonical non-empty text'
		);
	}
	if (!Array.isArray(value.toolNames)) {
		return failure('invalid_tool_names', 'Tool surface names must be an array');
	}
	if (value.toolNames.length > AGENTIC_CHAT_TOOL_SURFACE_MAX_TOOLS) {
		return failure(
			'tool_count_exceeded',
			`Tool surface exceeds ${AGENTIC_CHAT_TOOL_SURFACE_MAX_TOOLS} tools`
		);
	}
	if (!Array.isArray(value.definitions)) {
		return failure('invalid_definitions', 'Tool surface definitions must be an array');
	}
	if (value.definitions.length > AGENTIC_CHAT_TOOL_SURFACE_MAX_TOOLS) {
		return failure(
			'tool_count_exceeded',
			`Tool surface exceeds ${AGENTIC_CHAT_TOOL_SURFACE_MAX_TOOLS} definitions`
		);
	}

	let serialized: string;
	try {
		const jsonCompatibilityError = findJsonCompatibilityError(value);
		if (jsonCompatibilityError) {
			return failure('not_json_compatible', jsonCompatibilityError);
		}
		serialized = JSON.stringify(value);
	} catch {
		return failure('not_json_compatible', 'Tool surface cannot be serialized as JSON');
	}
	if (utf8ByteLength(serialized) > AGENTIC_CHAT_TOOL_SURFACE_MAX_BYTES) {
		return failure(
			'surface_too_large',
			`Tool surface exceeds ${AGENTIC_CHAT_TOOL_SURFACE_MAX_BYTES} UTF-8 bytes`
		);
	}

	const toolNames: string[] = [];
	const selectedNames = new Set<string>();
	for (const name of value.toolNames) {
		if (!isCanonicalText(name, 256)) {
			return failure('invalid_tool_names', 'Tool names must be canonical non-empty text');
		}
		if (selectedNames.has(name)) {
			return failure('duplicate_tool_name', `Tool surface repeats ${name}`);
		}
		selectedNames.add(name);
		toolNames.push(name);
	}

	const definitions: ChatToolDefinition[] = [];
	const definitionNames = new Set<string>();
	for (const candidate of value.definitions) {
		const definition = decodeToolDefinition(candidate);
		if (!definition.ok) return definition;
		const name = definition.definition.function.name;
		if (definitionNames.has(name)) {
			return failure('duplicate_tool_name', `Tool definitions repeat ${name}`);
		}
		definitionNames.add(name);
		definitions.push(definition.definition);
	}

	if (
		toolNames.length !== definitions.length ||
		toolNames.some((name, index) => definitions[index]?.function.name !== name)
	) {
		return failure(
			'name_definition_mismatch',
			'Tool names and definitions must agree exactly and preserve the same order'
		);
	}

	const registryVersion = optionalCanonicalVersion(value.registryVersion);
	if (!registryVersion.ok) return registryVersion;
	const discoveryPolicyVersion = optionalCanonicalVersion(value.discoveryPolicyVersion);
	if (!discoveryPolicyVersion.ok) return discoveryPolicyVersion;

	return {
		ok: true,
		source,
		surface: {
			version: AGENTIC_CHAT_TOOL_SURFACE_VERSION,
			surfaceProfile: value.surfaceProfile,
			toolNames,
			definitions,
			...(registryVersion.value ? { registryVersion: registryVersion.value } : {}),
			...(discoveryPolicyVersion.value
				? { discoveryPolicyVersion: discoveryPolicyVersion.value }
				: {})
		}
	};
}

export function buildAgenticChatToolSurfaceV1(input: {
	surfaceProfile: string;
	definitions: readonly ChatToolDefinition[];
	registryVersion?: string;
	discoveryPolicyVersion?: string;
}): AgenticChatToolSurfaceV1 {
	const candidate = {
		version: AGENTIC_CHAT_TOOL_SURFACE_VERSION,
		surfaceProfile: input.surfaceProfile,
		toolNames: input.definitions.map((definition) => definition.function.name),
		definitions: [...input.definitions],
		...(input.registryVersion !== undefined ? { registryVersion: input.registryVersion } : {}),
		...(input.discoveryPolicyVersion !== undefined
			? { discoveryPolicyVersion: input.discoveryPolicyVersion }
			: {})
	};
	const decoded = decodeAgenticChatToolSurfaceV1(candidate, { allowLegacy: false });
	if (!decoded.ok) {
		throw new Error(`Invalid Agentic Chat tool surface: ${decoded.code}: ${decoded.detail}`);
	}
	return decoded.surface;
}

type DefinitionDecodeResult =
	| { ok: true; definition: ChatToolDefinition }
	| Extract<AgenticChatToolSurfaceDecodeResult, { ok: false }>;

function decodeToolDefinition(value: unknown): DefinitionDecodeResult {
	if (!isRecord(value) || value.type !== 'function' || !isRecord(value.function)) {
		return failure('invalid_definition', 'Every tool definition must be a function');
	}
	const fn = value.function;
	if (!isCanonicalText(fn.name, 256)) {
		return failure('invalid_definition', 'Tool definition name is invalid');
	}
	if (typeof fn.description !== 'string' || fn.description.trim().length === 0) {
		return failure('invalid_definition', `${fn.name} must have a non-empty description`);
	}
	if (
		!isRecord(fn.parameters) ||
		fn.parameters.type !== 'object' ||
		!isRecord(fn.parameters.properties)
	) {
		return failure(
			'invalid_definition',
			`${fn.name} must have a top-level object parameter schema with properties`
		);
	}

	const cloned = JSON.parse(JSON.stringify(value)) as ChatToolDefinition;
	return {
		ok: true,
		definition: {
			type: 'function',
			function: {
				name: cloned.function.name,
				description: cloned.function.description,
				parameters: cloned.function.parameters
			}
		}
	};
}

function optionalCanonicalVersion(
	value: unknown
):
	| { ok: true; value: string | undefined }
	| Extract<AgenticChatToolSurfaceDecodeResult, { ok: false }> {
	if (value === undefined) return { ok: true, value: undefined };
	return isCanonicalText(value, 256)
		? { ok: true, value }
		: failure(
				'invalid_observability_version',
				'Tool surface observability versions must be canonical non-empty text'
			);
}

function findJsonCompatibilityError(value: unknown): string | null {
	const visiting = new Set<object>();

	function visit(candidate: unknown, path: string, depth: number): string | null {
		if (depth > 64) return `${path} exceeds the maximum JSON nesting depth`;
		if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') {
			return null;
		}
		if (typeof candidate === 'number') {
			return Number.isFinite(candidate) ? null : `${path} contains a non-finite number`;
		}
		if (typeof candidate !== 'object') return `${path} is not JSON-compatible`;
		if (visiting.has(candidate)) return `${path} contains a cycle`;
		if (!Array.isArray(candidate)) {
			const prototype = Object.getPrototypeOf(candidate);
			if (prototype !== Object.prototype && prototype !== null) {
				return `${path} is not a plain JSON object`;
			}
		}

		visiting.add(candidate);
		if (Array.isArray(candidate)) {
			for (let index = 0; index < candidate.length; index += 1) {
				const issue = visit(candidate[index], `${path}[${index}]`, depth + 1);
				if (issue) return issue;
			}
		} else {
			for (const [key, nested] of Object.entries(candidate)) {
				const issue = visit(nested, `${path}.${key}`, depth + 1);
				if (issue) return issue;
			}
		}
		visiting.delete(candidate);
		return null;
	}

	return visit(value, 'toolSurface', 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCanonicalText(value: unknown, maxLength: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maxLength &&
		value === value.trim()
	);
}

function utf8ByteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

function failure(
	code: AgenticChatToolSurfaceDecodeErrorCode,
	detail: string
): Extract<AgenticChatToolSurfaceDecodeResult, { ok: false }> {
	return { ok: false, code, detail };
}
