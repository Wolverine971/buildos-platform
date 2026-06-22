// packages/shared-agent-ops/src/gateway/op-execution-gateway.serializers.ts
import type { ExternalLinkEntityKind } from './op-execution-gateway.config';

function normalizeDocumentChildren(value: unknown): Array<Record<string, unknown>> {
	if (Array.isArray(value)) {
		return value.filter(
			(child): child is Record<string, unknown> =>
				Boolean(child) && typeof child === 'object' && !Array.isArray(child)
		);
	}

	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const children = (value as Record<string, unknown>).children;
		return normalizeDocumentChildren(children);
	}

	return [];
}

function stripInternalEntityFields(row: Record<string, unknown>): Record<string, unknown> {
	const { search_vector: _searchVector, ...rest } = row;
	return rest;
}

export function serializeExternalEntity(
	kind: ExternalLinkEntityKind,
	row: Record<string, unknown>,
	projectName?: string | null
): Record<string, unknown> {
	const serialized = stripInternalEntityFields(row);
	if (kind === 'document' && Object.prototype.hasOwnProperty.call(serialized, 'children')) {
		serialized.children = normalizeDocumentChildren(serialized.children);
	}
	if (projectName !== undefined) {
		serialized.project_name = projectName;
	}
	return serialized;
}

function serializeDocumentMap(
	documents: Record<string, unknown>
): Record<string, Record<string, unknown>> {
	return Object.fromEntries(
		Object.entries(documents).map(([id, document]) => [
			id,
			document && typeof document === 'object' && !Array.isArray(document)
				? serializeExternalEntity('document', document as Record<string, unknown>)
				: document
		])
	) as Record<string, Record<string, unknown>>;
}

export function serializeDocumentTree(tree: Record<string, unknown>): Record<string, unknown> {
	const documents =
		tree.documents && typeof tree.documents === 'object' && !Array.isArray(tree.documents)
			? serializeDocumentMap(tree.documents as Record<string, unknown>)
			: {};
	const serializeDocumentArray = (value: unknown) =>
		Array.isArray(value)
			? value
					.filter(
						(document): document is Record<string, unknown> =>
							Boolean(document) &&
							typeof document === 'object' &&
							!Array.isArray(document)
					)
					.map((document) => serializeExternalEntity('document', document))
			: [];

	return {
		...tree,
		documents,
		unlinked: serializeDocumentArray(tree.unlinked),
		archived: serializeDocumentArray(tree.archived)
	};
}

export function serializeProjectGraphData(graph: Record<string, unknown>): Record<string, unknown> {
	const arrayKinds: Record<string, ExternalLinkEntityKind> = {
		plans: 'plan',
		tasks: 'task',
		goals: 'goal',
		milestones: 'milestone',
		documents: 'document',
		risks: 'risk',
		requirements: 'requirement',
		metrics: 'metric',
		sources: 'source'
	};
	const serialized: Record<string, unknown> = { ...graph };
	if (graph.project && typeof graph.project === 'object' && !Array.isArray(graph.project)) {
		serialized.project = serializeExternalEntity(
			'project',
			graph.project as Record<string, unknown>
		);
	}

	for (const [key, kind] of Object.entries(arrayKinds)) {
		const value = graph[key];
		if (!Array.isArray(value)) continue;
		serialized[key] = value
			.filter(
				(row): row is Record<string, unknown> =>
					Boolean(row) && typeof row === 'object' && !Array.isArray(row)
			)
			.map((row) => serializeExternalEntity(kind, row));
	}

	return serialized;
}
