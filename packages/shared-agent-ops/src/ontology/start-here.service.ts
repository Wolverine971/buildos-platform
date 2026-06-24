// packages/shared-agent-ops/src/ontology/start-here.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import { addDocumentToTree } from './doc-structure.service';
import {
	buildStartHereTemplate,
	buildStartHereTitle,
	isExplicitStartHereDocument,
	mergeStartHereManagedRegions,
	pickProjectStartHereDocument,
	renderStartHereManagedRegion,
	START_HERE_DOCUMENT_TYPE_KEY,
	type StartHereManagedRegionInput
} from './start-here';

type Supabase = SupabaseClient<Database>;

export type StartHereDocumentRecord = Pick<
	Database['public']['Tables']['onto_documents']['Row'],
	| 'id'
	| 'project_id'
	| 'title'
	| 'content'
	| 'type_key'
	| 'state_key'
	| 'created_at'
	| 'updated_at'
	| 'props'
>;

export type EnsureProjectStartHereParams = {
	supabase: Supabase;
	projectId: string;
	actorId: string;
	projectName?: string | null;
	projectDescription?: string | null;
	addToTree?: boolean;
};

export type EnsureProjectStartHereResult =
	| {
			ok: true;
			created: boolean;
			document: StartHereDocumentRecord;
	  }
	| {
			ok: false;
			error: string;
	  };

export type RefreshProjectStartHereManagedRegionsParams = EnsureProjectStartHereParams & {
	regions: StartHereManagedRegionInput[];
};

export type RefreshProjectStartHereManagedRegionsResult =
	| {
			ok: true;
			created: boolean;
			updated: boolean;
			documentId: string;
	  }
	| {
			ok: false;
			error: string;
	  };

async function loadStartHereDocument(
	supabase: Supabase,
	projectId: string
): Promise<StartHereDocumentRecord | null> {
	const { data, error } = await supabase
		.from('onto_documents')
		.select(
			'id, project_id, title, content, type_key, state_key, created_at, updated_at, props'
		)
		.eq('project_id', projectId)
		.eq('type_key', START_HERE_DOCUMENT_TYPE_KEY)
		.is('deleted_at', null)
		.is('archived_at', null)
		.order('updated_at', { ascending: false })
		.limit(20);

	if (error) {
		throw error;
	}

	const explicit = ((data ?? []) as StartHereDocumentRecord[]).filter(
		isExplicitStartHereDocument
	);
	return pickProjectStartHereDocument(explicit);
}

async function loadProjectFallback(
	supabase: Supabase,
	projectId: string
): Promise<{ name: string | null; description: string | null } | null> {
	const { data, error } = await supabase
		.from('onto_projects')
		.select('name, description')
		.eq('id', projectId)
		.maybeSingle();

	if (error) {
		throw error;
	}

	return data ? { name: data.name ?? null, description: data.description ?? null } : null;
}

async function addStartHereToTree(params: {
	supabase: Supabase;
	projectId: string;
	documentId: string;
	title: string;
	actorId: string;
}): Promise<void> {
	try {
		await addDocumentToTree(
			params.supabase,
			params.projectId,
			params.documentId,
			{
				position: 0,
				title: params.title,
				description: 'Project orientation and current context'
			},
			params.actorId
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!message.toLowerCase().includes('already exists')) {
			throw error;
		}
	}
}

export async function ensureProjectStartHereDocument(
	params: EnsureProjectStartHereParams
): Promise<EnsureProjectStartHereResult> {
	try {
		const existing = await loadStartHereDocument(params.supabase, params.projectId);
		if (existing) {
			return { ok: true, created: false, document: existing };
		}

		const fallback =
			params.projectName || params.projectDescription
				? null
				: await loadProjectFallback(params.supabase, params.projectId);
		const projectName = params.projectName ?? fallback?.name ?? 'Project';
		const projectDescription = params.projectDescription ?? fallback?.description ?? null;
		const title = buildStartHereTitle(projectName);
		const content = buildStartHereTemplate({
			projectName,
			projectDescription
		});

		const { data, error } = await params.supabase
			.from('onto_documents')
			.insert({
				project_id: params.projectId,
				title,
				type_key: START_HERE_DOCUMENT_TYPE_KEY,
				state_key: 'draft',
				content,
				props: {
					origin: 'start_here_template',
					body_markdown: content,
					managed_region_version: 1
				} as Json,
				created_by: params.actorId
			})
			.select(
				'id, project_id, title, content, type_key, state_key, created_at, updated_at, props'
			)
			.single();

		if (error || !data) {
			throw error ?? new Error('Failed to create Start Here document');
		}

		const document = data as StartHereDocumentRecord;
		if (params.addToTree !== false) {
			await addStartHereToTree({
				supabase: params.supabase,
				projectId: params.projectId,
				documentId: document.id,
				title: document.title,
				actorId: params.actorId
			});
		}

		return { ok: true, created: true, document };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

export async function refreshProjectStartHereManagedRegions(
	params: RefreshProjectStartHereManagedRegionsParams
): Promise<RefreshProjectStartHereManagedRegionsResult> {
	const ensured = await ensureProjectStartHereDocument(params);
	if (!ensured.ok) return ensured;

	const currentContent =
		ensured.document.content ??
		buildStartHereTemplate({
			projectName: params.projectName,
			projectDescription: params.projectDescription
		});
	const nextContent = mergeStartHereManagedRegions(currentContent, params.regions);

	if (nextContent === currentContent) {
		return {
			ok: true,
			created: ensured.created,
			updated: false,
			documentId: ensured.document.id
		};
	}

	const { error } = await params.supabase
		.from('onto_documents')
		.update({
			content: nextContent
		})
		.eq('id', ensured.document.id)
		.eq('project_id', params.projectId);

	if (error) {
		return { ok: false, error: error.message };
	}

	return {
		ok: true,
		created: ensured.created,
		updated: true,
		documentId: ensured.document.id
	};
}

export function renderManagedRegionForPersistence(region: StartHereManagedRegionInput): string {
	return renderStartHereManagedRegion(region);
}
