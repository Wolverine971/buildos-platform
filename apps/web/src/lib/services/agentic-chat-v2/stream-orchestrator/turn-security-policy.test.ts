// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/turn-security-policy.test.ts
import { describe, expect, it } from 'vitest';
import type { FastChatHistoryMessage } from '../types';
import {
	evaluateInteractiveChatToolSecurity,
	hasExplicitWriteReviewConfirmation,
	isHighImpactWriteToolName,
	isPotentiallyUntrustedContentToolCall,
	isPotentiallyUntrustedContentToolName,
	isTrustedUserWriteCommission
} from './turn-security-policy';

function evaluate(
	overrides: Partial<Parameters<typeof evaluateInteractiveChatToolSecurity>[0]> = {}
) {
	return evaluateInteractiveChatToolSecurity({
		toolName: 'update_onto_task',
		phase: 'execution',
		externalContentIngested: false,
		roundContainsExternalContent: false,
		isCurrentExternalContentSource: false,
		reviewConfirmationTurn: false,
		writeReviewConfirmed: false,
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

	it('does not materialize an uncommissioned write without a contract', () => {
		expect(
			evaluate({
				toolName: 'create_onto_milestone',
				phase: 'materialization',
				trustedUserWriteCommission: false
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

	it('recognizes content sources while excluding server-authored discovery catalogs', () => {
		expect(isPotentiallyUntrustedContentToolName('web_visit')).toBe(true);
		expect(isPotentiallyUntrustedContentToolName('get_email_message')).toBe(true);
		expect(isPotentiallyUntrustedContentToolName('read_document_section')).toBe(true);
		expect(isPotentiallyUntrustedContentToolName('search_onto_projects')).toBe(false);
		expect(isPotentiallyUntrustedContentToolName('tool_search')).toBe(false);
		expect(isPotentiallyUntrustedContentToolName('skill_load')).toBe(false);
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

	it('accepts confirmation only as an immediate response to an assistant review request', () => {
		const reviewHistory: FastChatHistoryMessage[] = [
			{
				role: 'assistant',
				content:
					'This will delete the event permanently. Proposed operation: `delete_calendar_event`. Please confirm before I apply it.'
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
				toolName: 'delete_calendar_event'
			})
		).toBe(true);
		expect(
			hasExplicitWriteReviewConfirmation({
				history: reviewHistory,
				message: 'Yes, delete it.',
				toolName: 'delete_onto_project'
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
