// apps/web/src/lib/server/user-profile.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('UserProfileService');

type AnySupabase = SupabaseClient<Database>;

type ProfileDocTreeNode = {
	id: string;
	order?: number;
	type?: 'doc' | 'folder';
	title?: string | null;
	children?: ProfileDocTreeNode[];
};

type ProfileDocStructure = {
	version: number;
	root: ProfileDocTreeNode[];
};

type ProfileSummaryResult = {
	profileId: string;
	safeSummary: string | null;
};

const DEFAULT_DOC_STRUCTURE: ProfileDocStructure = {
	version: 1,
	root: []
};

const PROFILE_SUMMARY_MAX_CHARS = 1800;

function parseDocStructure(value: unknown): ProfileDocStructure {
	if (!value || typeof value !== 'object') {
		return { ...DEFAULT_DOC_STRUCTURE, root: [] };
	}
	const raw = value as Record<string, unknown>;
	const version =
		typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1;
	const root = normalizeNodes(raw.root);
	return { version, root };
}

function normalizeNodes(value: unknown): ProfileDocTreeNode[] {
	if (!Array.isArray(value)) return [];
	const nodes: ProfileDocTreeNode[] = [];
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		const id = typeof record.id === 'string' ? record.id : null;
		if (!id) continue;
		const order =
			typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : 0;
		const title =
			typeof record.title === 'string'
				? record.title
				: record.title === null
					? null
					: undefined;
		const type = record.type === 'folder' || record.type === 'doc' ? record.type : 'doc';
		const children = normalizeNodes(record.children);
		nodes.push({
			id,
			order,
			type,
			...(title !== undefined ? { title } : {}),
			...(children.length > 0 ? { children } : {})
		});
	}
	return reorderNodes(nodes);
}

function reorderNodes(nodes: ProfileDocTreeNode[]): ProfileDocTreeNode[] {
	return nodes.map((node, index) => ({
		...node,
		order: index,
		...(node.children && node.children.length > 0
			? { children: reorderNodes(node.children) }
			: {})
	}));
}

function insertNodeIntoTree(
	nodes: ProfileDocTreeNode[],
	newNode: ProfileDocTreeNode,
	parentId: string | null,
	position?: number
): ProfileDocTreeNode[] {
	if (!parentId) {
		const root = [...nodes];
		const safePos =
			typeof position === 'number' && Number.isFinite(position)
				? Math.max(0, Math.min(position, root.length))
				: root.length;
		root.splice(safePos, 0, newNode);
		return reorderNodes(root);
	}

	let inserted = false;
	const visit = (tree: ProfileDocTreeNode[]): ProfileDocTreeNode[] =>
		tree.map((node) => {
			if (inserted) return node;
			if (node.id !== parentId) {
				if (node.children?.length) {
					return {
						...node,
						children: visit(node.children)
					};
				}
				return node;
			}

			const children = [...(node.children ?? [])];
			const safePos =
				typeof position === 'number' && Number.isFinite(position)
					? Math.max(0, Math.min(position, children.length))
					: children.length;
			children.splice(safePos, 0, newNode);
			inserted = true;
			return {
				...node,
				children: reorderNodes(children)
			};
		});

	const updated = visit(nodes);
	if (!inserted) {
		return insertNodeIntoTree(updated, newNode, null, position);
	}
	return reorderNodes(updated);
}

function removeNodeFromTree(nodes: ProfileDocTreeNode[], nodeId: string): ProfileDocTreeNode[] {
	const filtered = nodes
		.filter((node) => node.id !== nodeId)
		.map((node) => ({
			...node,
			...(node.children?.length
				? { children: removeNodeFromTree(node.children, nodeId) }
				: {})
		}));
	return reorderNodes(filtered);
}

function updateNodeTitle(
	nodes: ProfileDocTreeNode[],
	nodeId: string,
	title: string | null
): ProfileDocTreeNode[] {
	return nodes.map((node) => {
		if (node.id === nodeId) {
			return { ...node, ...(title ? { title } : {}) };
		}
		if (node.children?.length) {
			return {
				...node,
				children: updateNodeTitle(node.children, nodeId, title)
			};
		}
		return node;
	});
}

function truncateProfileSummary(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length <= PROFILE_SUMMARY_MAX_CHARS) return trimmed;
	return `${trimmed.slice(0, PROFILE_SUMMARY_MAX_CHARS - 3)}...`;
}

export async function resolveProfileActorId(
	supabase: AnySupabase,
	userId: string
): Promise<string | null> {
	const { data, error } = await supabase.rpc('ensure_actor_for_user', { p_user_id: userId });
	if (error || !data) return null;
	return typeof data === 'string' ? data : null;
}

export async function ensureUserProfile(
	supabase: AnySupabase,
	userId: string
): Promise<Record<string, any>> {
	const supabaseAny = supabase as any;

	const { data: existing, error: existingError } = await supabaseAny
		.from('user_profiles')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();

	if (existingError) {
		throw new Error(`Failed to load user profile: ${existingError.message}`);
	}
	if (existing) return existing;

	const actorId = await resolveProfileActorId(supabase, userId);

	const { data: inserted, error: insertError } = await supabaseAny
		.from('user_profiles')
		.insert({
			user_id: userId,
			actor_id: actorId,
			extraction_enabled: false,
			doc_structure: DEFAULT_DOC_STRUCTURE
		})
		.select('*')
		.single();

	if (!insertError && inserted) return inserted;

	const { data: raced, error: raceError } = await supabaseAny
		.from('user_profiles')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();
	if (raceError || !raced) {
		throw new Error(
			`Failed to create user profile: ${insertError?.message ?? raceError?.message ?? 'unknown'}`
		);
	}
	return raced;
}

export async function getUserProfileWithCounts(
	supabase: AnySupabase,
	userId: string
): Promise<Record<string, any> & { chapter_count: number; pending_fragment_count: number }> {
	const supabaseAny = supabase as any;
	const profile = await ensureUserProfile(supabase, userId);
	const profileId = profile.id as string;

	const [
		{ count: chapterCount, error: chapterCountError },
		{ count: pendingCount, error: pendingCountError }
	] = await Promise.all([
		supabaseAny
			.from('profile_documents')
			.select('id', { count: 'exact', head: true })
			.eq('profile_id', profileId)
			.is('deleted_at', null),
		supabaseAny
			.from('profile_fragments')
			.select('id', { count: 'exact', head: true })
			.eq('profile_id', profileId)
			.eq('status', 'pending')
	]);

	if (chapterCountError) {
		logger.warn('Failed to count profile chapters', {
			userId,
			error: chapterCountError
		});
	}
	if (pendingCountError) {
		logger.warn('Failed to count profile pending fragments', {
			userId,
			error: pendingCountError
		});
	}

	return {
		...profile,
		chapter_count: chapterCount ?? 0,
		pending_fragment_count: pendingCount ?? 0
	};
}

export async function getProfilePromptSummary(params: {
	supabase: AnySupabase;
	userId: string;
}): Promise<ProfileSummaryResult | null> {
	const { supabase, userId } = params;
	const supabaseAny = supabase as any;
	const { data, error } = await supabaseAny
		.from('user_profiles')
		.select('id, safe_summary')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		logger.warn('Failed to load profile prompt summary', { userId, error });
		return null;
	}
	if (!data) return null;

	const safeSummary = truncateProfileSummary(data.safe_summary);
	if (!safeSummary) {
		return {
			profileId: data.id,
			safeSummary: null
		};
	}

	return {
		profileId: data.id,
		safeSummary
	};
}

export async function listProfileChapters(
	supabase: AnySupabase,
	userId: string
): Promise<{ profile: Record<string, any>; chapters: Record<string, any>[] }> {
	const supabaseAny = supabase as any;
	const profile = await ensureUserProfile(supabase, userId);

	const { data, error } = await supabaseAny
		.from('profile_documents')
		.select('*')
		.eq('profile_id', profile.id)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false });

	if (error) {
		throw new Error(`Failed to list profile chapters: ${error.message}`);
	}

	return {
		profile,
		chapters: data ?? []
	};
}

export async function getProfileChapter(
	supabase: AnySupabase,
	userId: string,
	chapterId: string
): Promise<{ profile: Record<string, any>; chapter: Record<string, any> | null }> {
	const supabaseAny = supabase as any;
	const profile = await ensureUserProfile(supabase, userId);

	const { data, error } = await supabaseAny
		.from('profile_documents')
		.select('*')
		.eq('id', chapterId)
		.eq('profile_id', profile.id)
		.is('deleted_at', null)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to load profile chapter: ${error.message}`);
	}

	return { profile, chapter: data ?? null };
}

async function addVersion(params: {
	supabase: AnySupabase;
	documentId: string;
	content: string | null;
	createdBy: string | null;
	changeType: 'manual_edit' | 'accepted_fragment' | 'merge_apply';
	mergeRunId?: string | null;
}): Promise<Record<string, any>> {
	const { supabase, documentId, content, createdBy, changeType, mergeRunId } = params;
	const supabaseAny = supabase as any;
	const { data: latest, error: latestError } = await supabaseAny
		.from('profile_document_versions')
		.select('number')
		.eq('document_id', documentId)
		.order('number', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (latestError) {
		throw new Error(`Failed to determine next chapter version: ${latestError.message}`);
	}

	const nextNumber = (latest?.number ?? 0) + 1;
	const { data: version, error: versionError } = await supabaseAny
		.from('profile_document_versions')
		.insert({
			document_id: documentId,
			number: nextNumber,
			content,
			created_by: createdBy,
			change_type: changeType,
			merge_run_id: mergeRunId ?? null
		})
		.select('*')
		.single();

	if (versionError || !version) {
		throw new Error(`Failed to create chapter version: ${versionError?.message ?? 'unknown'}`);
	}

	return version;
}

export async function createProfileChapter(params: {
	supabase: AnySupabase;
	userId: string;
	title: string;
	typeKey?: string | null;
	content?: string | null;
	summary?: string | null;
	sensitivity?: 'standard' | 'sensitive';
	usageScope?: 'all_agents' | 'profile_only' | 'never_prompt';
	parentId?: string | null;
	position?: number;
	props?: Record<string, Json | undefined>;
}): Promise<{ profile: Record<string, any>; chapter: Record<string, any> }> {
	const { supabase, userId } = params;
	const supabaseAny = supabase as any;
	const profile = await ensureUserProfile(supabase, userId);
	const actorId = await resolveProfileActorId(supabase, userId);

	const title = params.title.trim();
	if (!title) {
		throw new Error('Chapter title is required');
	}

	const insertPayload = {
		profile_id: profile.id,
		title,
		type_key: params.typeKey?.trim() || 'chapter.general',
		content: typeof params.content === 'string' ? params.content : null,
		summary: typeof params.summary === 'string' ? params.summary : null,
		sensitivity: params.sensitivity ?? 'standard',
		usage_scope: params.usageScope ?? 'all_agents',
		props: params.props ?? {}
	};

	const { data: chapter, error: chapterError } = await supabaseAny
		.from('profile_documents')
		.insert(insertPayload)
		.select('*')
		.single();

	if (chapterError || !chapter) {
		throw new Error(`Failed to create chapter: ${chapterError?.message ?? 'unknown'}`);
	}

	await addVersion({
		supabase,
		documentId: chapter.id,
		content: chapter.content ?? null,
		createdBy: actorId,
		changeType: 'manual_edit'
	});

	const structure = parseDocStructure(profile.doc_structure);
	const updatedRoot = insertNodeIntoTree(
		structure.root,
		{ id: chapter.id, type: 'doc', title: chapter.title },
		params.parentId ?? null,
		params.position
	);

	const { error: structureError } = await supabaseAny
		.from('user_profiles')
		.update({
			doc_structure: { ...structure, root: updatedRoot },
			summary_updated_at: null
		})
		.eq('id', profile.id);

	if (structureError) {
		logger.warn('Failed to update profile doc_structure after chapter create', {
			profileId: profile.id,
			chapterId: chapter.id,
			error: structureError
		});
	}

	return { profile, chapter };
}

export async function updateProfileChapter(params: {
	supabase: AnySupabase;
	userId: string;
	chapterId: string;
	title?: string | null;
	typeKey?: string | null;
	content?: string | null;
	summary?: string | null;
	sensitivity?: 'standard' | 'sensitive';
	usageScope?: 'all_agents' | 'profile_only' | 'never_prompt';
	props?: Record<string, Json | undefined>;
}): Promise<{ chapter: Record<string, any> | null; updated: boolean }> {
	const { supabase, userId, chapterId } = params;
	const supabaseAny = supabase as any;
	const { profile, chapter } = await getProfileChapter(supabase, userId, chapterId);
	if (!chapter) return { chapter: null, updated: false };

	const actorId = await resolveProfileActorId(supabase, userId);
	const updatePayload: Record<string, unknown> = {};
	let contentChanged = false;
	let titleChanged = false;

	if (params.title !== undefined) {
		const title = typeof params.title === 'string' ? params.title.trim() : '';
		updatePayload.title = title || chapter.title;
		titleChanged = title !== chapter.title;
	}
	if (params.typeKey !== undefined) {
		updatePayload.type_key =
			typeof params.typeKey === 'string' && params.typeKey.trim()
				? params.typeKey.trim()
				: chapter.type_key;
	}
	if (params.content !== undefined) {
		updatePayload.content = params.content;
		contentChanged = (params.content ?? null) !== (chapter.content ?? null);
	}
	if (params.summary !== undefined) {
		updatePayload.summary = params.summary;
	}
	if (params.sensitivity !== undefined) {
		updatePayload.sensitivity = params.sensitivity;
	}
	if (params.usageScope !== undefined) {
		updatePayload.usage_scope = params.usageScope;
	}
	if (params.props !== undefined) {
		updatePayload.props = params.props ?? {};
	}

	if (Object.keys(updatePayload).length === 0) {
		return { chapter, updated: false };
	}

	updatePayload.updated_at = new Date().toISOString();

	const { data: updated, error: updateError } = await supabaseAny
		.from('profile_documents')
		.update(updatePayload)
		.eq('id', chapterId)
		.eq('profile_id', profile.id)
		.select('*')
		.maybeSingle();

	if (updateError) {
		throw new Error(`Failed to update chapter: ${updateError.message}`);
	}

	if (contentChanged) {
		await addVersion({
			supabase,
			documentId: chapterId,
			content: (updated?.content ?? null) as string | null,
			createdBy: actorId,
			changeType: 'manual_edit'
		});
	}

	if (titleChanged && updated?.title) {
		const structure = parseDocStructure(profile.doc_structure);
		const withTitle = updateNodeTitle(structure.root, chapterId, updated.title);
		const { error: treeError } = await supabaseAny
			.from('user_profiles')
			.update({
				doc_structure: { ...structure, root: reorderNodes(withTitle) },
				summary_updated_at: null
			})
			.eq('id', profile.id);
		if (treeError) {
			logger.warn('Failed to update profile doc_structure title metadata', {
				profileId: profile.id,
				chapterId,
				error: treeError
			});
		}
	} else {
		const { error: staleError } = await supabaseAny
			.from('user_profiles')
			.update({ summary_updated_at: null })
			.eq('id', profile.id);
		if (staleError) {
			logger.warn('Failed to mark profile summary as stale', {
				profileId: profile.id,
				chapterId,
				error: staleError
			});
		}
	}

	return {
		chapter: updated ?? chapter,
		updated: true
	};
}

export async function deleteProfileChapter(params: {
	supabase: AnySupabase;
	userId: string;
	chapterId: string;
}): Promise<{ deleted: boolean }> {
	const { supabase, userId, chapterId } = params;
	const supabaseAny = supabase as any;
	const { profile, chapter } = await getProfileChapter(supabase, userId, chapterId);
	if (!chapter) return { deleted: false };

	const { error: deleteError } = await supabaseAny
		.from('profile_documents')
		.update({
			deleted_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', chapterId)
		.eq('profile_id', profile.id);

	if (deleteError) {
		throw new Error(`Failed to delete chapter: ${deleteError.message}`);
	}

	const structure = parseDocStructure(profile.doc_structure);
	const updatedRoot = removeNodeFromTree(structure.root, chapterId);
	const { error: treeError } = await supabaseAny
		.from('user_profiles')
		.update({
			doc_structure: { ...structure, root: updatedRoot },
			summary_updated_at: null
		})
		.eq('id', profile.id);

	if (treeError) {
		logger.warn('Failed to update profile doc_structure on chapter delete', {
			profileId: profile.id,
			chapterId,
			error: treeError
		});
	}

	return { deleted: true };
}

export async function listProfileFragments(params: {
	supabase: AnySupabase;
	userId: string;
	status?: string | null;
	limit?: number;
}): Promise<{ profile: Record<string, any>; fragments: Record<string, any>[] }> {
	const { supabase, userId, status, limit = 100 } = params;
	const supabaseAny = supabase as any;
	const profile = await ensureUserProfile(supabase, userId);

	let query = supabaseAny
		.from('profile_fragments')
		.select('*')
		.eq('profile_id', profile.id)
		.order('created_at', { ascending: false })
		.limit(Math.max(1, Math.min(limit, 500)));

	if (status && typeof status === 'string') {
		query = query.eq('status', status);
	}

	const { data, error } = await query;
	if (error) {
		throw new Error(`Failed to list profile fragments: ${error.message}`);
	}

	return {
		profile,
		fragments: data ?? []
	};
}

export async function updateProfileFragmentStatuses(params: {
	supabase: AnySupabase;
	userId: string;
	fragmentIds: string[];
	status: 'pending' | 'accepted' | 'dismissed' | 'needs_review';
}): Promise<{ updatedCount: number }> {
	const { supabase, userId, fragmentIds, status } = params;
	const supabaseAny = supabase as any;
	const profile = await ensureUserProfile(supabase, userId);
	if (!fragmentIds.length) return { updatedCount: 0 };

	const { data, error } = await supabaseAny
		.from('profile_fragments')
		.update({ status })
		.eq('profile_id', profile.id)
		.in('id', fragmentIds)
		.select('id');

	if (error) {
		throw new Error(`Failed to update profile fragments: ${error.message}`);
	}

	return { updatedCount: Array.isArray(data) ? data.length : 0 };
}

export async function updateUserProfileSettings(params: {
	supabase: AnySupabase;
	userId: string;
	extractionEnabled?: boolean;
	summary?: string | null;
	safeSummary?: string | null;
}): Promise<Record<string, any>> {
	const { supabase, userId, extractionEnabled, summary, safeSummary } = params;
	const supabaseAny = supabase as any;
	const profile = await ensureUserProfile(supabase, userId);
	const updatePayload: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	};

	if (typeof extractionEnabled === 'boolean') {
		updatePayload.extraction_enabled = extractionEnabled;
	}
	if (summary !== undefined) {
		updatePayload.summary = summary;
	}
	if (safeSummary !== undefined) {
		updatePayload.safe_summary = safeSummary;
	}
	if (summary !== undefined || safeSummary !== undefined) {
		updatePayload.summary_updated_at = new Date().toISOString();
	}

	const { data, error } = await supabaseAny
		.from('user_profiles')
		.update(updatePayload)
		.eq('id', profile.id)
		.select('*')
		.single();

	if (error || !data) {
		throw new Error(`Failed to update profile settings: ${error?.message ?? 'unknown'}`);
	}

	return data;
}

export async function markProfileSummaryStale(params: {
	supabase: AnySupabase;
	profileId: string;
}): Promise<void> {
	const { supabase, profileId } = params;
	const supabaseAny = supabase as any;
	const { error } = await supabaseAny
		.from('user_profiles')
		.update({ summary_updated_at: null })
		.eq('id', profileId);
	if (error) {
		logger.warn('Failed to mark profile summary stale', { profileId, error });
	}
}

export async function insertProfileAuditEvent(params: {
	supabase: AnySupabase;
	profileId: string;
	actorId?: string | null;
	accessType: 'prompt_injection' | 'search' | 'doc_read' | 'doc_write';
	contextType?: string | null;
	documentIds?: string[] | null;
	reason?: string | null;
}): Promise<void> {
	const { supabase, profileId, actorId, accessType, contextType, documentIds, reason } = params;
	const supabaseAny = supabase as any;
	const { error } = await supabaseAny.from('profile_access_audit').insert({
		profile_id: profileId,
		actor_id: actorId ?? null,
		access_type: accessType,
		context_type: contextType ?? null,
		document_ids: Array.isArray(documentIds) ? documentIds : null,
		reason: reason ?? null
	});

	if (error) {
		logger.warn('Failed to insert profile access audit event', {
			profileId,
			accessType,
			error
		});
	}
}
