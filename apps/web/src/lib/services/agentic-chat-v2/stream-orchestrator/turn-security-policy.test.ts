// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/turn-security-policy.test.ts
import { describe, expect, it } from 'vitest';
import type { FastChatHistoryMessage } from '../types';
import { AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1 } from '@buildos/agentic-chat-runtime/tools';
import {
	buildWriteReviewProposal,
	evaluateInteractiveChatToolSecurity,
	hasExplicitWriteReviewConfirmation,
	isHighImpactWriteToolName,
	isPrivateOrStoredContentToolCall,
	isPotentiallyUntrustedContentToolCall,
	isPotentiallyUntrustedContentToolName,
	isTrustedUserWriteCommission,
	isWriteToolCommissionedByUserMessage,
	isWriteToolReviewCommissionedByUserMessage
} from './turn-security-policy';

function evaluate(
	overrides: Partial<Parameters<typeof evaluateInteractiveChatToolSecurity>[0]> = {}
) {
	return evaluateInteractiveChatToolSecurity({
		toolName: 'update_onto_task',
		phase: 'execution',
		externalContentIngested: false,
		privateContentIngested: false,
		roundContainsExternalContent: false,
		isCurrentExternalContentSource: false,
		reviewConfirmationTurn: false,
		writeReviewConfirmed: false,
		writeExecutionAuthorized: true,
		trustedUserWriteCommission: true,
		turnContractDeclared: false,
		...overrides
	});
}

describe('interactive chat turn security policy', () => {
	it('uses shared Agent Ops policy classification for ordinary writes', () => {
		expect(evaluate()).toMatchObject({
			allowed: true,
			isWrite: true,
			operationName: 'onto.task.update'
		});
	});

	it('requires later user review after content-bearing reads', () => {
		expect(evaluate({ externalContentIngested: true })).toMatchObject({
			allowed: false,
			reason: 'external_content_review_required',
			requiresUserAction: true
		});
		expect(
			evaluate({
				toolName: 'web_visit',
				roundContainsExternalContent: true,
				isCurrentExternalContentSource: true
			})
		).toMatchObject({ allowed: true, isWrite: false });
	});

	it('blocks outbound web egress after private content without breaking ordinary web research', () => {
		expect(evaluate({ toolName: 'web_visit', privateContentIngested: true })).toMatchObject({
			allowed: false,
			isWrite: false,
			reason: 'private_content_egress_review_required',
			requiresUserAction: true
		});
		expect(
			evaluate({
				toolName: 'web_visit',
				externalContentIngested: true,
				privateContentIngested: false
			})
		).toMatchObject({ allowed: true, isWrite: false });
	});

	it('requires current-message provenance before any outbound web request', () => {
		expect(
			evaluate({
				toolName: 'web_search',
				egressProvenanceAllowed: false
			})
		).toMatchObject({
			allowed: false,
			isWrite: false,
			reason: 'web_egress_provenance_required',
			requiresUserAction: true
		});
	});

	it('requires explicit confirmation for destructive and opaque writes', () => {
		expect(evaluate({ toolName: 'delete_calendar_event' })).toMatchObject({
			allowed: false,
			reason: 'high_impact_confirmation_required'
		});
		expect(
			evaluate({ toolName: 'delete_calendar_event', writeReviewConfirmed: true })
		).toMatchObject({ allowed: true, isWrite: true });
		expect(isHighImpactWriteToolName('call_corsair_mcp_tool')).toBe(true);
		expect(evaluate({ toolName: 'call_corsair_mcp_tool' })).toMatchObject({
			allowed: false,
			isWrite: true,
			reason: 'high_impact_confirmation_required'
		});
	});

	it('blocks an already-mounted write outside the exact commissioned scope', () => {
		expect(
			evaluate({
				toolName: 'update_onto_project',
				writeExecutionAuthorized: false,
				trustedUserWriteCommission: true
			})
		).toMatchObject({
			allowed: false,
			reason: 'write_execution_scope_mismatch',
			requiresUserAction: false
		});
	});

	it('requires review instead of silently blocking a bounded natural-language write', () => {
		expect(
			evaluate({
				toolName: 'create_onto_task',
				writeExecutionAuthorized: false,
				writeReviewCommissioned: true
			})
		).toMatchObject({
			allowed: false,
			reason: 'write_execution_scope_mismatch',
			requiresUserAction: true
		});
		expect(
			isWriteToolReviewCommissionedByUserMessage({
				toolName: 'create_onto_task',
				message: 'Create a task to call Sam tomorrow at 3pm.',
				arguments: {
					project_id: 'project-1',
					title: 'Call Sam',
					due_at: '2026-09-02T19:00:00.000Z'
				}
			})
		).toBe(true);
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'create_onto_task',
				message: 'Create a task to call Sam tomorrow at 3pm.',
				arguments: {
					project_id: 'project-1',
					title: 'Call Sam',
					due_at: '2026-09-02T19:00:00.000Z'
				}
			})
		).toBe(false);
	});

	it('does not materialize an uncommissioned write without a contract', () => {
		expect(
			evaluate({
				toolName: 'create_onto_milestone',
				phase: 'materialization',
				trustedUserWriteCommission: false,
				writeExecutionAuthorized: false
			})
		).toMatchObject({
			allowed: false,
			reason: 'write_materialization_contract_required',
			requiresUserAction: false
		});
		expect(
			evaluate({
				toolName: 'create_onto_milestone',
				phase: 'materialization',
				trustedUserWriteCommission: false,
				writeExecutionAuthorized: false,
				turnContractDeclared: true
			})
		).toMatchObject({ allowed: true });
	});

	it('binds a confirmation turn to the operation that was reviewed', () => {
		expect(
			evaluate({ reviewConfirmationTurn: true, writeReviewConfirmed: false })
		).toMatchObject({
			allowed: false,
			reason: 'write_review_scope_mismatch'
		});
		expect(
			evaluate({ reviewConfirmationTurn: true, writeReviewConfirmed: true })
		).toMatchObject({ allowed: true });
	});

	it('derives materialization authority only from an explicit trusted user command', () => {
		expect(isTrustedUserWriteCommission('Create a January milestone.')).toBe(true);
		expect(isTrustedUserWriteCommission('Could you update that task status?')).toBe(true);
		expect(isTrustedUserWriteCommission('What happens if I delete this task?')).toBe(false);
		expect(isTrustedUserWriteCommission("Don't update this document.")).toBe(false);
	});

	it('limits direct user commissions to the requested entity class', () => {
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'update_onto_task',
				message: 'Please mark that task status done.',
				arguments: { task_id: 'task-1', state_key: 'done' },
				focusedEntityId: 'task-1'
			})
		).toBe(true);
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'create_onto_document',
				message: 'Please update that task status.',
				arguments: { project_id: 'project-1', title: 'Injected document' }
			})
		).toBe(false);
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'create_onto_task',
				message: 'Create a task with the title Launch plan.',
				arguments: { project_id: 'project-1', title: 'Launch plan' },
				focusedProjectId: 'project-1'
			})
		).toBe(true);
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'create_onto_task',
				message: 'Create a task with the title Launch plan.',
				arguments: { project_id: 'other-project', title: 'Launch plan' },
				focusedProjectId: null
			})
		).toBe(false);
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'create_onto_task',
				message: 'Create a task with the title Launch plan in Alpha Launch.',
				arguments: { project_id: 'alpha-project', title: 'Launch plan' },
				knownEntities: [{ id: 'alpha-project', kind: 'project', label: 'Alpha Launch' }]
			})
		).toBe(true);
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'update_onto_task',
				message: 'Rename this task title.',
				arguments: { task_id: 'task-1', title: 'Injected private value' },
				focusedEntityId: 'task-1'
			})
		).toBe(false);
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'create_onto_task',
				message: 'Create a task.',
				arguments: { project_id: 'project-1', title: 'Injected private value' }
			})
		).toBe(false);
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'move_document_in_tree',
				message: 'Move this document.',
				arguments: { document_id: 'doc-1', new_parent_id: 'doc-2' },
				focusedEntityId: 'doc-1'
			})
		).toBe(false);
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'create_onto_task',
				message: 'Please update that task status.',
				arguments: { project_id: 'project-1', title: 'Injected task' }
			})
		).toBe(false);
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'update_onto_task',
				message: 'Please rename that task title.',
				arguments: { task_id: 'task-1', state_key: 'done' },
				focusedEntityId: 'task-1'
			})
		).toBe(false);
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'create_onto_task',
				message: 'Create a document summarizing the task.',
				arguments: { project_id: 'project-1', title: 'Injected task' }
			})
		).toBe(false);
		expect(
			isWriteToolCommissionedByUserMessage({
				toolName: 'update_onto_task',
				message: 'Please update that task status.',
				arguments: { task_id: 'task-2', state_key: 'done' },
				focusedEntityId: 'task-1'
			})
		).toBe(false);
	});

	it('recognizes content sources while excluding server-authored discovery catalogs', () => {
		expect(isPotentiallyUntrustedContentToolName('web_visit')).toBe(true);
		expect(isPotentiallyUntrustedContentToolName('get_email_message')).toBe(true);
		expect(isPotentiallyUntrustedContentToolName('read_document_section')).toBe(true);
		expect(isPotentiallyUntrustedContentToolName('search_onto_projects')).toBe(true);
		expect(isPotentiallyUntrustedContentToolName('tool_search')).toBe(false);
		expect(isPotentiallyUntrustedContentToolName('skill_load')).toBe(false);
		for (const toolName of [
			'skill_search',
			'skill_load',
			'domain_search',
			'domain_load',
			'skill_reference_load'
		]) {
			expect(
				isPrivateOrStoredContentToolCall({
					id: toolName,
					type: 'function',
					function: { name: toolName, arguments: '{}' }
				})
			).toBe(false);
		}
		expect(
			isPrivateOrStoredContentToolCall({
				id: 'email-content',
				type: 'function',
				function: { name: 'get_email_message', arguments: '{}' }
			})
		).toBe(true);
		expect(
			isPrivateOrStoredContentToolCall({
				id: 'public-web',
				type: 'function',
				function: { name: 'web_visit', arguments: '{}' }
			})
		).toBe(false);
		expect(
			isPrivateOrStoredContentToolCall({
				id: 'workspace-search',
				type: 'function',
				function: { name: 'search_onto_projects', arguments: '{}' }
			})
		).toBe(true);
		expect(
			isPotentiallyUntrustedContentToolCall({
				id: 'tree-content',
				type: 'function',
				function: {
					name: 'get_document_tree',
					arguments: JSON.stringify({ include_content: true })
				}
			})
		).toBe(true);
	});

	it('taints every shared workspace read except server-authored field metadata', () => {
		for (const toolName of AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1) {
			expect(isPotentiallyUntrustedContentToolName(toolName), toolName).toBe(
				toolName !== 'get_field_info'
			);
		}
	});

	it('requires later review before writes derived from collaborative workspace content', () => {
		expect(
			evaluate({
				toolName: 'update_onto_task',
				externalContentIngested: true,
				trustedUserWriteCommission: true
			})
		).toMatchObject({
			allowed: false,
			reason: 'external_content_review_required',
			requiresUserAction: true
		});
	});

	it('accepts confirmation only as an immediate response to an assistant review request', () => {
		const signingSecret = 'test-review-signing-secret';
		const userId = 'user-1';
		const sessionId = 'session-1';
		const reviewedArguments = { event_id: 'event-a', calendar_source_id: 'source-a' };
		const reviewedProposal = buildWriteReviewProposal({
			toolName: 'delete_calendar_event',
			arguments: reviewedArguments,
			signingSecret,
			userId,
			sessionId
		});
		const reviewHistory: FastChatHistoryMessage[] = [
			{
				role: 'assistant',
				content: `This will delete the event permanently. Proposed operation: \`delete_calendar_event\`\nProposed arguments: \`${reviewedProposal.canonicalArguments}\`\nProposal fingerprint: \`${reviewedProposal.fingerprint}\`\nProposal authorization: \`${reviewedProposal.authorization}\`\nPlease confirm before I apply it.`
			}
		];
		expect(
			hasExplicitWriteReviewConfirmation({ history: reviewHistory, message: 'Yes, please.' })
		).toBe(true);
		expect(
			hasExplicitWriteReviewConfirmation({
				history: reviewHistory,
				message: 'Yes, delete it.'
			})
		).toBe(true);
		expect(
			hasExplicitWriteReviewConfirmation({
				history: reviewHistory,
				message: 'Yes, delete it.',
				toolName: 'delete_calendar_event',
				arguments: reviewedArguments,
				signingSecret,
				userId,
				sessionId
			})
		).toBe(true);
		expect(
			hasExplicitWriteReviewConfirmation({
				history: reviewHistory,
				message: 'Yes, delete it.',
				toolName: 'delete_onto_project',
				arguments: { project_id: 'project-a' },
				signingSecret,
				userId,
				sessionId
			})
		).toBe(false);
		expect(
			hasExplicitWriteReviewConfirmation({
				history: reviewHistory,
				message: 'Yes, delete it.',
				toolName: 'delete_calendar_event',
				arguments: { event_id: 'event-b', calendar_source_id: 'source-b' },
				signingSecret,
				userId,
				sessionId
			})
		).toBe(false);
		expect(
			hasExplicitWriteReviewConfirmation({
				history: reviewHistory,
				message: 'Yes, delete it.',
				toolName: 'delete_calendar_event',
				arguments: reviewedArguments,
				signingSecret: 'wrong-secret',
				userId,
				sessionId
			})
		).toBe(false);
		expect(hasExplicitWriteReviewConfirmation({ history: [], message: 'Yes, please.' })).toBe(
			false
		);
		expect(
			hasExplicitWriteReviewConfirmation({
				history: reviewHistory,
				message: 'No, leave it alone.'
			})
		).toBe(false);
	});
});
