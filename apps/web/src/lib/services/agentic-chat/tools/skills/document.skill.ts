// apps/web/src/lib/services/agentic-chat/tools/skills/document.skill.ts
import type { SkillDefinition } from './types';

export const documentSkill: SkillDefinition = {
	path: 'onto.document.skill',
	id: 'document',
	name: 'document',
	summary:
		'Project document hierarchy playbook for doc tree operations, unlinked docs, task docs, and document CRUD rules.',
	relatedOps: [
		'onto.document.create',
		'onto.document.update',
		'onto.document.delete',
		'onto.document.tree.get',
		'onto.document.tree.move',
		'onto.document.path.get',
		'onto.task.docs.list',
		'onto.task.docs.create_or_attach',
		'onto.edge.link'
	],
	whenToUse: [
		'Create or place a project document in the doc tree',
		'Reorganize project documents',
		'Link unlinked docs back into the tree',
		'Decide whether a document belongs in the project tree or a task workspace',
		'Reason about document hierarchy safely'
	],
	workflow: [
		'Decide whether the request is about a project document or a task document.',
		'For project documents, remember the hierarchy lives in doc_structure, not in document-to-document edges.',
		'For project document creation, onto.document.create must include at least project_id, title, and description.',
		'For task workspace documents, use onto.task.docs.* instead of the project doc tree.',
		'For reorganization or linking unlinked docs, call onto.document.tree.get once, analyze the result, then issue targeted onto.document.tree.move calls.',
		'When moving a document, pass exact document_id and new_position; use new_parent_id only when nesting under a parent.',
		'Only create semantic edges to documents from other entities when that relationship is useful; do not use edges to represent folder structure.'
	],
	guardrails: [
		'Do not use onto.project.graph.reorganize for document hierarchy.',
		'Do not treat document-to-document edges as the source of truth for hierarchy.',
		'delete_onto_document in agentic chat currently exposes only document_id; do not invent archive-mode args until the tool contract changes.'
	],
	examples: [
		{
			description: 'Organize unlinked project documents',
			next_steps: [
				'Call onto.document.tree.get once with include_documents=true.',
				'Identify unlinked or misplaced documents from that result.',
				'Issue targeted onto.document.tree.move calls without repeating tree.get unless a move fails.'
			]
		},
		{
			description: 'Attach documentation to a specific task',
			next_steps: [
				'Decide whether the document should live in the task workspace rather than the project doc tree.',
				'Inspect onto.task.docs.create_or_attach if needed.',
				'Use onto.task.docs.create_or_attach instead of project doc tree ops.'
			]
		}
	],
	notes: [
		'Project docs and task docs are different storage/workflow surfaces.',
		'The doc tree is structural; semantic edges to documents are optional and should reflect real relationships.'
	]
};
