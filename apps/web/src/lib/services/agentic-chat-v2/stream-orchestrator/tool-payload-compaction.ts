// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.ts
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';

type ToolArgumentParser = (rawArgs: unknown) => { args: Record<string, any>; error?: string };

const MAX_MODEL_TOOL_PAYLOAD_CHARS = 6000;
const MAX_TOOL_LIST_ITEMS = 20;

export function buildToolPayloadForModel(
	toolCall: ChatToolCall,
	result: ChatToolResult,
	_parseToolArguments: ToolArgumentParser
): unknown {
	const basePayload = result.result ?? (result.error ? { error: result.error } : null);
	if (basePayload === null || basePayload === undefined) {
		return null;
	}

	const toolName = toolCall.function?.name?.trim();
	if (toolName === 'tool_schema' || toolName === 'tool_search' || toolName === 'skill_load') {
		return compactGatewayMetaPayload(basePayload);
	}

	return compactDirectToolPayload(toolName ?? '', basePayload);
}

function compactExampleToolCall(payload: unknown): Record<string, any> | undefined {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return undefined;
	}

	const record = payload as Record<string, any>;
	const args =
		record.arguments && typeof record.arguments === 'object' && !Array.isArray(record.arguments)
			? (record.arguments as Record<string, any>)
			: {};

	return {
		name: record.name,
		arguments: args
	};
}

function compactGatewayMetaPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}

	const record = payload as Record<string, any>;
	const type = typeof record.type === 'string' ? record.type : '';
	if (!type) {
		return applyToolPayloadSizeGuard(payload);
	}

	if (type === 'op' || type === 'tool_schema') {
		const args = Array.isArray(record.args)
			? record.args.slice(0, 24).map((arg: Record<string, any>) => ({
					name: arg?.name,
					type: arg?.type,
					required: arg?.required,
					description:
						typeof arg?.description === 'string'
							? toTextPreview(arg.description, 160)
							: undefined
				}))
			: [];
		return applyToolPayloadSizeGuard({
			type,
			op: record.op,
			tool_name: record.tool_name,
			summary: record.summary,
			usage: record.usage,
			required_args: Array.isArray(record.required_args) ? record.required_args : [],
			id_args: Array.isArray(record.id_args) ? record.id_args : [],
			args,
			notes: Array.isArray(record.notes) ? record.notes.slice(0, 12) : [],
			policy:
				record.policy && typeof record.policy === 'object'
					? {
							do: Array.isArray(record.policy.do) ? record.policy.do.slice(0, 6) : [],
							dont: Array.isArray(record.policy.dont)
								? record.policy.dont.slice(0, 6)
								: [],
							edge_cases: Array.isArray(record.policy.edge_cases)
								? record.policy.edge_cases.slice(0, 4)
								: []
						}
					: undefined,
			example_tool_call: compactExampleToolCall(record.example_tool_call),
			examples: Array.isArray(record.examples) ? record.examples.slice(0, 4) : []
		});
	}

	if (type === 'skill') {
		return applyToolPayloadSizeGuard({
			type,
			id: record.id ?? record.path,
			name: record.name,
			description: record.description ?? record.summary,
			summary: record.summary,
			when_to_use: Array.isArray(record.when_to_use) ? record.when_to_use.slice(0, 8) : [],
			workflow: Array.isArray(record.workflow) ? record.workflow.slice(0, 10) : [],
			related_ops: Array.isArray(record.related_ops) ? record.related_ops.slice(0, 12) : [],
			guardrails: Array.isArray(record.guardrails) ? record.guardrails.slice(0, 8) : [],
			markdown:
				typeof record.markdown === 'string'
					? toTextPreview(record.markdown, 1200)
					: undefined,
			examples: Array.isArray(record.examples) ? record.examples.slice(0, 4) : [],
			notes: Array.isArray(record.notes) ? record.notes.slice(0, 6) : []
		});
	}

	if (type === 'capability') {
		return applyToolPayloadSizeGuard({
			type,
			path: record.path,
			name: record.name,
			status: record.status,
			summary: record.summary,
			what_you_can_do: Array.isArray(record.what_you_can_do)
				? record.what_you_can_do.slice(0, 8)
				: [],
			skill_entrypoints: Array.isArray(record.skill_entrypoints)
				? record.skill_entrypoints.slice(0, 8)
				: [],
			direct_paths: Array.isArray(record.direct_paths)
				? record.direct_paths.slice(0, 12)
				: [],
			notes: Array.isArray(record.notes) ? record.notes.slice(0, 6) : []
		});
	}

	if (type === 'directory') {
		return applyToolPayloadSizeGuard({
			type,
			path: record.path,
			groups: Array.isArray(record.groups) ? record.groups : undefined,
			items: Array.isArray(record.items) ? record.items.slice(0, MAX_TOOL_LIST_ITEMS) : [],
			capabilities: Array.isArray(record.capabilities)
				? record.capabilities.slice(0, MAX_TOOL_LIST_ITEMS)
				: [],
			skills: Array.isArray(record.skills) ? record.skills.slice(0, MAX_TOOL_LIST_ITEMS) : [],
			workflow: Array.isArray(record.workflow) ? record.workflow.slice(0, 8) : [],
			next_step: record.next_step,
			command_contract:
				record.command_contract && typeof record.command_contract === 'object'
					? record.command_contract
					: undefined,
			examples: Array.isArray(record.examples) ? record.examples.slice(0, 4) : []
		});
	}

	return applyToolPayloadSizeGuard(payload);
}

function compactDirectToolPayload(toolName: string, payload: unknown): unknown {
	const normalizedToolName = toolName.trim().toLowerCase();
	if (normalizedToolName === 'get_document_tree') {
		return compactDocumentTreeGatewayPayload(payload);
	}
	if (normalizedToolName === 'web_visit' || normalizedToolName === 'util.web.visit') {
		return compactWebVisitPayload(payload);
	}
	if (
		normalizedToolName === 'list_onto_documents' ||
		normalizedToolName === 'search_onto_documents'
	) {
		return compactDocumentCollectionGatewayPayload(payload);
	}
	return applyToolPayloadSizeGuard(payload);
}

function compactWebVisitPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return payload;
	}

	const record = payload as Record<string, any>;
	const info = record.info && typeof record.info === 'object' ? record.info : {};
	const structuredData = Array.isArray(record.structured_data)
		? record.structured_data.slice(0, 20).map(compactStructuredDataItem)
		: undefined;
	const links = Array.isArray(record.links)
		? record.links.slice(0, 10).map((link: any) => ({
				url: typeof link?.url === 'string' ? link.url : null,
				text: toTextPreview(link?.text, 120)
			}))
		: undefined;

	return applyToolPayloadSizeGuard({
		url: record.url,
		final_url: record.final_url,
		status_code: record.status_code,
		content_type: record.content_type,
		title: record.title,
		canonical_url: record.canonical_url,
		content_format: record.content_format,
		excerpt: toTextPreview(record.excerpt, 500),
		content: toTextPreview(record.content, 3500),
		truncated: record.truncated,
		structured_data: structuredData,
		structured_data_count: Array.isArray(record.structured_data)
			? record.structured_data.length
			: 0,
		links,
		meta:
			record.meta && typeof record.meta === 'object' && !Array.isArray(record.meta)
				? compactRecord(record.meta, 12, 220)
				: undefined,
		message: record.message,
		info: {
			fetched_at: info.fetched_at,
			mode: info.mode,
			parser: info.parser,
			extraction_strategy: info.extraction_strategy,
			fetch_ms: info.fetch_ms,
			bytes: info.bytes,
			html_chars: info.html_chars,
			markdown_chars: info.markdown_chars,
			cache_hit: info.cache_hit
		}
	});
}

function compactRecord(
	value: Record<string, any>,
	maxKeys: number,
	maxStringLength: number
): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	for (const [key, raw] of Object.entries(value).slice(0, maxKeys)) {
		if (typeof raw === 'string') {
			output[key] = toTextPreview(raw, maxStringLength);
		} else if (raw === null || typeof raw === 'number' || typeof raw === 'boolean') {
			output[key] = raw;
		}
	}
	return output;
}

function compactStructuredDataItem(item: unknown): unknown {
	if (!item || typeof item !== 'object' || Array.isArray(item)) {
		return item;
	}

	const record = item as Record<string, any>;
	return {
		type: record.type,
		name: toTextPreview(record.name, 220),
		startDate: record.startDate,
		endDate: record.endDate,
		eventStatus: record.eventStatus,
		eventAttendanceMode: record.eventAttendanceMode,
		location: compactStructuredDataPlace(record.location),
		offers: compactStructuredDataOffers(record.offers),
		organizer: compactStructuredDataThing(record.organizer),
		url: record.url,
		description: toTextPreview(record.description, 500)
	};
}

function compactStructuredDataThing(value: unknown): unknown {
	if (typeof value === 'string') return toTextPreview(value, 180);
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
	const record = value as Record<string, any>;
	return {
		type: record.type,
		name: toTextPreview(record.name, 180),
		url: record.url
	};
}

function compactStructuredDataPlace(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.slice(0, 4).map(compactStructuredDataPlace);
	}
	if (typeof value === 'string') return toTextPreview(value, 220);
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
	const record = value as Record<string, any>;
	return {
		type: record.type,
		name: toTextPreview(record.name, 220),
		address: compactStructuredDataAddress(record.address),
		url: record.url
	};
}

function compactStructuredDataAddress(value: unknown): unknown {
	if (typeof value === 'string') return toTextPreview(value, 220);
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
	const record = value as Record<string, any>;
	return {
		streetAddress: record.streetAddress,
		addressLocality: record.addressLocality,
		addressRegion: record.addressRegion,
		postalCode: record.postalCode,
		addressCountry: record.addressCountry
	};
}

function compactStructuredDataOffers(value: unknown): unknown {
	const offers = Array.isArray(value) ? value : value ? [value] : [];
	if (offers.length === 0) return undefined;
	return offers.slice(0, 6).map((offer) => {
		if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return offer;
		const record = offer as Record<string, any>;
		return {
			type: record.type,
			name: toTextPreview(record.name, 140),
			price: record.price,
			priceCurrency: record.priceCurrency,
			availability: record.availability,
			validFrom: record.validFrom,
			url: record.url
		};
	});
}

function compactDocumentTreeGatewayPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}
	const record = payload as Record<string, any>;
	const treeResult = record.result && typeof record.result === 'object' ? record.result : null;
	if (!treeResult) {
		return applyToolPayloadSizeGuard(payload);
	}

	const structure =
		treeResult.structure && typeof treeResult.structure === 'object'
			? treeResult.structure
			: {};
	const root = Array.isArray((structure as Record<string, any>).root)
		? ((structure as Record<string, any>).root as Array<Record<string, any>>)
		: [];
	const documents =
		treeResult.documents && typeof treeResult.documents === 'object'
			? (treeResult.documents as Record<string, any>)
			: {};
	const unlinkedRaw = Array.isArray(treeResult.unlinked) ? treeResult.unlinked : [];

	const rootSummary = root.slice(0, MAX_TOOL_LIST_ITEMS).map((node) => ({
		id: typeof node?.id === 'string' ? node.id : null,
		title: typeof node?.title === 'string' ? node.title : null,
		children_count: Array.isArray(node?.children) ? node.children.length : 0
	}));

	const unlinkedSummary = unlinkedRaw.slice(0, MAX_TOOL_LIST_ITEMS).map((item: any) => {
		if (typeof item === 'string') {
			const doc = documents[item];
			return {
				id: item,
				title: typeof doc?.title === 'string' ? doc.title : null
			};
		}
		if (item && typeof item === 'object') {
			return {
				id: typeof item.id === 'string' ? item.id : null,
				title: typeof item.title === 'string' ? item.title : null
			};
		}
		return { id: null, title: null };
	});

	const compactPayload: Record<string, unknown> = {
		op: record.op,
		ok: record.ok,
		result: {
			message: typeof treeResult.message === 'string' ? treeResult.message : null,
			counts: {
				root_count: root.length,
				document_count: Object.keys(documents).length,
				unlinked_count: unlinkedRaw.length
			},
			root: rootSummary,
			unlinked: unlinkedSummary
		},
		meta: record.meta
	};
	if (root.length > rootSummary.length) {
		(compactPayload.result as Record<string, unknown>).root_truncated =
			root.length - rootSummary.length;
	}
	if (unlinkedRaw.length > unlinkedSummary.length) {
		(compactPayload.result as Record<string, unknown>).unlinked_truncated =
			unlinkedRaw.length - unlinkedSummary.length;
	}

	return applyToolPayloadSizeGuard(compactPayload);
}

function compactDocumentCollectionGatewayPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}
	const record = payload as Record<string, any>;
	const listResult = record.result && typeof record.result === 'object' ? record.result : null;
	if (!listResult) {
		return applyToolPayloadSizeGuard(payload);
	}

	const documentsRaw = Array.isArray(listResult.documents) ? listResult.documents : [];
	const summary = documentsRaw.slice(0, MAX_TOOL_LIST_ITEMS).map((doc: any) => ({
		id: typeof doc?.id === 'string' ? doc.id : null,
		title: typeof doc?.title === 'string' ? doc.title : null,
		type_key: typeof doc?.type_key === 'string' ? doc.type_key : null,
		state_key: typeof doc?.state_key === 'string' ? doc.state_key : null,
		updated_at: typeof doc?.updated_at === 'string' ? doc.updated_at : null,
		content_length:
			typeof doc?.content_length === 'number'
				? doc.content_length
				: typeof doc?.content === 'string'
					? doc.content.length
					: 0,
		description_preview: toTextPreview(doc?.description, 180),
		markdown_outline: compactMarkdownOutline(doc?.markdown_outline)
	}));
	const total =
		typeof listResult.total === 'number' ? listResult.total : Math.max(documentsRaw.length, 0);

	const compactPayload: Record<string, unknown> = {
		op: record.op,
		ok: record.ok,
		result: {
			message: typeof listResult.message === 'string' ? listResult.message : null,
			total,
			documents: summary
		},
		meta: record.meta
	};
	if (documentsRaw.length > summary.length) {
		(compactPayload.result as Record<string, unknown>).documents_truncated =
			documentsRaw.length - summary.length;
	}

	return applyToolPayloadSizeGuard(compactPayload);
}

function toTextPreview(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length <= maxLength) return trimmed;
	return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
}

function compactMarkdownOutline(outline: unknown): unknown {
	if (!outline || typeof outline !== 'object') return null;
	const record = outline as Record<string, any>;
	const counts =
		record.counts && typeof record.counts === 'object'
			? {
					total:
						typeof (record.counts as Record<string, any>).total === 'number'
							? (record.counts as Record<string, any>).total
							: 0,
					h1:
						typeof (record.counts as Record<string, any>).h1 === 'number'
							? (record.counts as Record<string, any>).h1
							: 0,
					h2:
						typeof (record.counts as Record<string, any>).h2 === 'number'
							? (record.counts as Record<string, any>).h2
							: 0,
					h3:
						typeof (record.counts as Record<string, any>).h3 === 'number'
							? (record.counts as Record<string, any>).h3
							: 0
				}
			: { total: 0, h1: 0, h2: 0, h3: 0 };
	const headings = Array.isArray(record.headings) ? record.headings : [];
	return {
		counts,
		headings: headings.slice(0, 24),
		truncated: Boolean(record.truncated) || headings.length > 24
	};
}

function applyToolPayloadSizeGuard(payload: unknown): unknown {
	try {
		const serialized = JSON.stringify(payload);
		if (serialized.length <= MAX_MODEL_TOOL_PAYLOAD_CHARS) {
			return payload;
		}
		return {
			truncated: true,
			original_length: serialized.length,
			preview: `${serialized.slice(0, MAX_MODEL_TOOL_PAYLOAD_CHARS)}...`
		};
	} catch {
		return payload;
	}
}
