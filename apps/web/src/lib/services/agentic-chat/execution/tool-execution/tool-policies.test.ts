// apps/web/src/lib/services/agentic-chat/execution/tool-execution/tool-policies.test.ts
import { describe, expect, it } from 'vitest';
import type { ServiceContext } from '../../shared/types';
import { SameTurnDocumentRegistry } from './same-turn-document-registry';
import {
	DOMAIN_PREFLIGHT_POLICY_ORDER,
	runPostAuthorizationPreflight,
	stripServerOwnedWorkspaceProps
} from './tool-policies';

const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
const documentId = '9da52903-4bb5-4c3f-af32-cb4a2c623dec';
const warning = "You're already in this project. Are you sure you want to create a new project?";

function userMessage(content: string): ServiceContext['conversationHistory'][number] {
	return { role: 'user', content } as ServiceContext['conversationHistory'][number];
}

function assistantMessage(content: string): ServiceContext['conversationHistory'][number] {
	return { role: 'assistant', content } as ServiceContext['conversationHistory'][number];
}

function context(overrides: Partial<ServiceContext> = {}): ServiceContext {
	return {
		sessionId: 'session',
		userId: 'user',
		contextType: 'project',
		entityId: projectId,
		contextScope: { projectId },
		conversationHistory: [],
		...overrides
	};
}

describe('tool preflight policies', () => {
	it('publishes the exact policy order around authorization', () => {
		expect(DOMAIN_PREFLIGHT_POLICY_ORDER).toEqual({
			preAuthorization: ['strip_server_owned_workspace_props'],
			postAuthorization: [
				'duplicate_document_create',
				'project_creation_profile_and_grounding',
				'project_creation_context_confirmation',
				'document_description_requirements'
			]
		});
	});

	it('strips server-owned workspace props immutably at every supported container', () => {
		const args = {
			props: { agent_workspace: { mode: 'living_reference' }, root_safe: true },
			document: {
				props: { agent_workspace: { mode: 'living_reference' }, document_safe: true }
			},
			project: {
				props: { agent_workspace: { mode: 'living_reference' }, project_safe: true }
			},
			updates: {
				props: { agent_workspace: { mode: 'living_reference' }, updates_safe: true }
			}
		};
		const before = structuredClone(args);
		const stripped = stripServerOwnedWorkspaceProps('update_onto_document', args);

		expect(stripped).toEqual({
			props: { root_safe: true },
			document: { props: { document_safe: true } },
			project: { props: { project_safe: true } },
			updates: { props: { updates_safe: true } }
		});
		expect(args).toEqual(before);
		expect(stripServerOwnedWorkspaceProps('get_onto_document_details', args)).toBe(args);
	});

	it('applies and grounds the server-selected fiction project profile', () => {
		const result = runPostAuthorizationPreflight({
			toolName: 'create_onto_project',
			args: {
				project: {
					name: 'The Glass Harbor',
					type_key: 'project.creative.novel',
					props: { facets: { stage: 'discovery' } }
				},
				entities: [],
				relationships: []
			},
			context: context({
				contextType: 'project_create',
				entityId: undefined,
				contextScope: undefined,
				conversationHistory: [
					userMessage(
						'Create an ongoing workspace for my novel and keep it organized whenever I add story details.'
					)
				]
			}),
			toolCallId: 'create-project',
			sameTurnDocuments: new SameTurnDocumentRegistry()
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.args.project).toMatchObject({
			props: {
				facets: { stage: 'discovery' },
				agent_workspace: {
					mode: 'living_reference',
					domain_profile: 'fiction_story',
					domain_affinity: 'writing.fiction'
				}
			}
		});
	});

	it('preserves project-context confirmation and affirmative repair behavior', () => {
		const base = {
			toolName: 'create_onto_project',
			args: {
				project: { name: 'New project', type_key: 'project.general' },
				entities: [],
				relationships: []
			},
			toolCallId: 'project-confirmation',
			sameTurnDocuments: new SameTurnDocumentRegistry()
		};
		const originalTurnContext = {
			contextType: 'project' as const,
			entityId: projectId,
			entityName: 'Existing project'
		};
		const blocked = runPostAuthorizationPreflight({
			...base,
			context: context({
				contextType: 'global',
				entityId: undefined,
				contextScope: undefined,
				originalTurnContext,
				conversationHistory: [userMessage('Start another project.')]
			})
		});

		expect(blocked).toEqual({
			ok: false,
			result: expect.objectContaining({
				error: warning,
				errorType: 'validation_error',
				data: expect.objectContaining({
					type: 'project_creation_confirmation_required'
				})
			})
		});

		const confirmed = runPostAuthorizationPreflight({
			...base,
			context: context({
				originalTurnContext,
				conversationHistory: [
					assistantMessage(warning),
					userMessage('Yes, create it as a new project.')
				]
			})
		});
		expect(confirmed.ok).toBe(true);
	});

	it('blocks snapshot and same-turn duplicates unless duplicate intent is explicit', () => {
		const registry = new SameTurnDocumentRegistry();
		registry.rememberCreatedDocument(
			{ title: 'Same-turn notes' },
			{ data: { document_id: documentId } }
		);
		const duplicateContext = context({
			conversationHistory: [userMessage("Add this detail; don't create a duplicate.")],
			ontologyContext: {
				type: 'project',
				entities: {
					documents: [
						{
							id: documentId,
							project_id: projectId,
							title: 'Existing Notes'
						} as never
					]
				},
				metadata: {},
				scope: { projectId }
			}
		});
		const run = (title: string, runContext = duplicateContext) =>
			runPostAuthorizationPreflight({
				toolName: 'create_onto_document',
				args: { project_id: projectId, title, description: 'Notes' },
				context: runContext,
				toolCallId: 'duplicate',
				sameTurnDocuments: registry
			});

		expect(run('Existing Notes')).toMatchObject({
			ok: false,
			result: { error: expect.stringContaining(documentId) }
		});
		expect(run('Same-turn notes')).toMatchObject({
			ok: false,
			result: { error: expect.stringContaining('already created earlier in this turn') }
		});
		expect(
			run(
				'Existing Notes',
				context({
					...duplicateContext,
					conversationHistory: [
						userMessage('Create a duplicate copy of the Existing Notes document.')
					]
				})
			).ok
		).toBe(true);
	});

	it('does not rewrite authorized document content from user-message wording', () => {
		const source =
			'Chapter 5 opens Part II the morning after Ilyan chooses not to report Mara.';
		const result = runPostAuthorizationPreflight({
			toolName: 'update_onto_document',
			args: {
				document_id: documentId,
				content: '## Chapter 5\n\nPart II begins.',
				update_strategy: 'append'
			},
			context: context({
				conversationHistory: [userMessage(source)],
				ontologyContext: {
					type: 'project',
					entities: {
						project: {
							id: projectId,
							props: {
								agent_workspace: {
									mode: 'living_reference',
									domain_profile: 'fiction_story'
								}
							}
						} as never,
						documents: [
							{
								id: documentId,
								project_id: projectId,
								title: 'Story Structure',
								type_key: 'document.creative.structure'
							} as never
						]
					},
					metadata: {},
					scope: { projectId }
				}
			}),
			toolCallId: 'fiction-update',
			sameTurnDocuments: new SameTurnDocumentRegistry()
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.args.content).toBe('## Chapter 5\n\nPart II begins.');
		expect(result.args.content).not.toContain(source);
	});

	it('preserves exact document-description validation and trimming', () => {
		const missing = runPostAuthorizationPreflight({
			toolName: 'create_onto_document',
			args: { title: 'Notes', description: '   ' },
			context: context(),
			toolCallId: 'missing-description',
			sameTurnDocuments: new SameTurnDocumentRegistry()
		});
		expect(missing).toMatchObject({
			ok: false,
			result: { error: 'create_onto_document requires a non-empty description' }
		});

		const trimmed = runPostAuthorizationPreflight({
			toolName: 'create_task_document',
			args: { task_id: 'task', description: '  Task notes  ' },
			context: context(),
			toolCallId: 'trim-description',
			sameTurnDocuments: new SameTurnDocumentRegistry()
		});
		expect(trimmed).toMatchObject({ ok: true, args: { description: 'Task notes' } });
	});
});
