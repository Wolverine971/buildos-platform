// packages/shared-agent-ops/src/permissions/proposal.ts
import { z } from 'zod';
import { resolveDocumentEdits, largeDeletionRefusal } from '../ontology/document-edits';
const textEdit = z
	.object({
		old_text: z.string().min(1),
		new_text: z.string(),
		replace_all: z.boolean().optional()
	})
	.strict();
const sectionEdit = z
	.object({
		action: z.enum(['replace', 'delete', 'append', 'prepend', 'move']),
		section: z.string().min(1),
		content: z.string().optional(),
		after_section: z.string().optional(),
		before_section: z.string().optional()
	})
	.strict();
const fields = {
	title: z.string().trim().min(1).max(500).optional(),
	description: z.string().max(10000).nullable().optional()
};
export const permissionProposalSchema = z.discriminatedUnion('kind', [
	z
		.object({
			kind: z.literal('document'),
			target_id: z.string().uuid(),
			changes: z
				.object({
					...fields,
					content: z.string().optional(),
					update_mode: z.enum(['replace', 'append']).optional(),
					edits: z.array(textEdit).min(1).max(50).optional(),
					section_edits: z.array(sectionEdit).min(1).max(50).optional()
				})
				.strict()
		})
		.strict(),
	z
		.object({
			kind: z.literal('task'),
			target_id: z.string().uuid(),
			changes: z
				.object({
					...fields,
					state_key: z.enum(['todo', 'in_progress', 'blocked', 'done']).optional(),
					priority: z.number().int().min(1).max(5).nullable().optional()
				})
				.strict()
		})
		.strict()
]);
export type PermissionProposal = z.infer<typeof permissionProposalSchema>;
export function normalizePermissionProposal(input: unknown): PermissionProposal {
	if (Buffer.byteLength(JSON.stringify(input) ?? '', 'utf8') > 256 * 1024)
		throw new Error('Proposal exceeds 256 KiB');
	let submitted = input;
	if (
		input &&
		typeof input === 'object' &&
		'kind' in input &&
		input.kind === 'document' &&
		'changes' in input &&
		input.changes &&
		typeof input.changes === 'object'
	) {
		const changes = { ...input.changes } as Record<string, unknown>;
		if ('update_strategy' in changes) {
			if ('update_mode' in changes && changes.update_mode !== changes.update_strategy)
				throw new Error('Conflicting update modes');
			changes.update_mode = changes.update_strategy;
			delete changes.update_strategy;
		}
		submitted = { ...input, changes };
	}
	const value = permissionProposalSchema.parse(submitted);
	if (!Object.keys(value.changes).length) throw new Error('Propose at least one change');
	if (value.kind === 'document') {
		const c = value.changes;
		if ((c.content !== undefined ? 1 : 0) + (c.edits ? 1 : 0) + (c.section_edits ? 1 : 0) > 1)
			throw new Error('Choose one body edit format');
		if (c.update_mode && c.content === undefined)
			throw new Error('update_mode requires content');
		if (c.content !== undefined) c.update_mode ??= 'replace';
	}
	return value;
}
export function buildPermissionMutation(
	proposal: PermissionProposal,
	before: Record<string, any>
): Record<string, unknown> {
	if (before.deleted_at || before.archived_at || before.state_key === 'archived')
		throw new Error('Target is archived');
	const next: Record<string, unknown> = { ...proposal.changes };
	if (proposal.kind === 'document') {
		if (before.type_key === 'document.context.project')
			throw new Error('Managed Start Here documents cannot request edits');
		const c = proposal.changes;
		const body = before.content ?? before.props?.body_markdown ?? '';
		delete next.update_mode;
		delete next.edits;
		delete next.section_edits;
		if (c.content !== undefined)
			next.content =
				c.update_mode === 'append'
					? body
						? `${body}\n\n${c.content}`
						: c.content
					: c.content;
		if (c.edits || c.section_edits) {
			const edit = resolveDocumentEdits({
				project_id: before.project_id,
				document_id: before.id,
				content: body,
				edits: c.edits,
				section_edits: c.section_edits
			});
			if (edit.status !== 'resolved')
				throw new Error(edit.failures.map((f) => f.message).join('; '));
			next.content = edit.next_content;
		}
		if (typeof next.content === 'string') {
			if (Buffer.byteLength(next.content, 'utf8') > 200 * 1024)
				throw new Error('Document exceeds 200 KiB');
			const refusal = largeDeletionRefusal(body, next.content);
			if (refusal) throw new Error(refusal);
		}
	}
	if (Object.entries(next).every(([key, value]) => value === (before[key] ?? null)))
		throw new Error('Proposal has no changes');
	return next;
}
