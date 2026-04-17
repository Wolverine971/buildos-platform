// apps/web/src/lib/server/comment-public-access.ts
//
// Document-level public access check for comments. Use this when deciding
// whether to allow an anon (or non-member) viewer to read/write comments
// on a project entity. The existing project-level `is_public` flag is not
// granular enough — it would open all project entities rather than just the
// documents that have been explicitly published.
//
// Returns true iff:
//   - entityType === 'document'
//   - onto_public_pages has a non-deleted row for that document
//   - status='published' AND public_status='live' AND visibility='public'
//
// Unlisted documents intentionally do not qualify — unlisted is a "share via
// direct link" primitive, not a public-commenting primitive.

type SupabaseLike = {
	from: (table: string) => any;
};

export async function isDocumentLiveAndPublic(
	supabase: SupabaseLike,
	documentId: string
): Promise<boolean> {
	const { data, error } = await (supabase as any)
		.from('onto_public_pages')
		.select('id')
		.eq('document_id', documentId)
		.eq('status', 'published')
		.eq('public_status', 'live')
		.eq('visibility', 'public')
		.is('deleted_at', null)
		.limit(1)
		.maybeSingle();

	if (error || !data) return false;
	return true;
}

export async function canAccessPublicComments(
	supabase: SupabaseLike,
	entityType: string,
	entityId: string
): Promise<boolean> {
	if (entityType !== 'document') return false;
	return isDocumentLiveAndPublic(supabase, entityId);
}

export async function resolveCommentEntityOwnerActorId(
	supabase: SupabaseLike,
	entityType: string,
	entityId: string
): Promise<string | null> {
	// For now only documents — other entity types stay gated on project access.
	if (entityType !== 'document') return null;
	const { data } = await (supabase as any)
		.from('onto_public_pages')
		.select('published_by, created_by')
		.eq('document_id', entityId)
		.is('deleted_at', null)
		.limit(1)
		.maybeSingle();
	if (!data) return null;
	const actorId = data.published_by ?? data.created_by ?? null;
	return typeof actorId === 'string' ? actorId : null;
}
