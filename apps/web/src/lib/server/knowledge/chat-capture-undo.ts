// apps/web/src/lib/server/knowledge/chat-capture-undo.ts
//
// Undo for the knowledge part of a chat checkpoint (tasker 164). The worker's capture
// (apps/worker/src/workers/chat/checkpoint/knowledgeCapture.ts) stores in
// chat_capture_checkpoints.details.knowledge exactly what it added or changed; Undo takes back
// only that:
//   - facts it added → retracted (they stay hidden; a later capture won't bring them back);
//   - existing facts whose status it changed → put back, while they still have that status;
//   - one-line summaries it rewrote → put back, while unchanged since;
//   - its chat links and its chat/web sources → deleted (citations go with the sources);
//   - entries it created → deleted when nothing else is recorded about them.
// Entries and facts that existed before the capture are left as they are. Every write is
// filtered to the signed-in user's own rows (this runs with the admin client).

// Knowledge tables aren't in the generated types yet.
type AdminClient = { from(relation: any): any };

export type ChatKnowledgeUndoReceipt = {
	fact_ids: string[];
	restore: Array<{ id: string; status: string; after: string }>;
	summaries: Array<{ id: string; before: string | null; after: string | null }>;
	link_ids: string[];
	source_ids: string[];
	created_entity_ids: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FACT_STATUSES = new Set(['active', 'suggested', 'disputed', 'superseded', 'retracted']);

function ids(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((id): id is string => typeof id === 'string' && UUID.test(id))
		: [];
}

/** The undo part of a checkpoint's knowledge receipt, or null when it wrote nothing. */
export function readChatKnowledgeReceipt(details: unknown): ChatKnowledgeUndoReceipt | null {
	const record =
		details && typeof details === 'object' && !Array.isArray(details)
			? (details as Record<string, unknown>).knowledge
			: null;
	if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
	const knowledge = record as Record<string, unknown>;
	const receipt: ChatKnowledgeUndoReceipt = {
		fact_ids: ids(knowledge.fact_ids),
		restore: (Array.isArray(knowledge.restore) ? knowledge.restore : []).flatMap((raw) => {
			const item = raw as Record<string, unknown> | null;
			return item &&
				typeof item.id === 'string' &&
				UUID.test(item.id) &&
				typeof item.status === 'string' &&
				FACT_STATUSES.has(item.status) &&
				typeof item.after === 'string'
				? [{ id: item.id, status: item.status, after: item.after }]
				: [];
		}),
		summaries: (Array.isArray(knowledge.summaries) ? knowledge.summaries : []).flatMap(
			(raw) => {
				const item = raw as Record<string, unknown> | null;
				const text = (value: unknown) => (typeof value === 'string' ? value : null);
				return item && typeof item.id === 'string' && UUID.test(item.id)
					? [{ id: item.id, before: text(item.before), after: text(item.after) }]
					: [];
			}
		),
		link_ids: ids(knowledge.link_ids),
		source_ids: ids(knowledge.source_ids),
		created_entity_ids: ids(knowledge.created_entity_ids)
	};
	return receipt.fact_ids.length ? receipt : null;
}

export async function undoChatKnowledgeCapture(params: {
	admin: AdminClient;
	userId: string;
	receipt: ChatKnowledgeUndoReceipt;
}): Promise<'retracted' | 'none'> {
	const { admin, userId, receipt } = params;
	const check = (result: { error?: unknown }) => {
		if (result?.error) throw result.error;
		return result as { data?: unknown; error?: unknown };
	};

	const retracted = check(
		await admin
			.from('knowledge_facts')
			.update({ status: 'retracted' })
			.eq('owner_user_id', userId)
			.in('id', receipt.fact_ids)
			.neq('status', 'retracted')
			.select('id')
	);
	const changed = ((retracted.data as unknown[]) ?? []).length;

	for (const item of receipt.restore) {
		check(
			await admin
				.from('knowledge_facts')
				.update({ status: item.status })
				.eq('owner_user_id', userId)
				.eq('id', item.id)
				.eq('status', item.after)
		);
	}

	for (const item of receipt.summaries) {
		let query = admin
			.from('knowledge_entities')
			.update({ summary: item.before })
			.eq('owner_user_id', userId)
			.eq('id', item.id);
		query = item.after === null ? query.is('summary', null) : query.eq('summary', item.after);
		check(await query);
	}

	if (receipt.link_ids.length) {
		check(
			await admin
				.from('knowledge_record_links')
				.delete()
				.eq('owner_user_id', userId)
				.in('id', receipt.link_ids)
		);
	}
	if (receipt.source_ids.length) {
		check(
			await admin
				.from('knowledge_sources')
				.delete()
				.eq('owner_user_id', userId)
				.in('id', receipt.source_ids)
		);
	}

	// Entries the capture created go too, unless something else has been recorded about them since.
	const ours = new Set(receipt.fact_ids);
	for (const entityId of receipt.created_entity_ids) {
		const [asSubject, asObject, links] = await Promise.all([
			admin
				.from('knowledge_facts')
				.select('id')
				.eq('owner_user_id', userId)
				.eq('entity_id', entityId)
				.limit(50),
			admin
				.from('knowledge_facts')
				.select('id')
				.eq('owner_user_id', userId)
				.eq('object_entity_id', entityId)
				.limit(50),
			admin
				.from('knowledge_record_links')
				.select('id')
				.eq('owner_user_id', userId)
				.eq('entity_id', entityId)
				.limit(1)
		]);
		for (const result of [asSubject, asObject, links]) check(result);
		const others = [...(asSubject.data ?? []), ...(asObject.data ?? [])].some(
			(row: { id: string }) => !ours.has(row.id)
		);
		if (others || (links.data ?? []).length) continue;
		check(
			await admin
				.from('knowledge_entities')
				.delete()
				.eq('id', entityId)
				.eq('owner_user_id', userId)
				.eq('is_self', false)
		);
	}
	return changed > 0 ? 'retracted' : 'none';
}
