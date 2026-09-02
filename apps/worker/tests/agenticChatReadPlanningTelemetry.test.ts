// apps/worker/tests/agenticChatReadPlanningTelemetry.test.ts
import { describe, expect, it } from 'vitest';
import { deriveAgenticChatReadPlanningIdentityV1 } from '../src/workers/agentic-chat/readPlanningTelemetry';

describe('Agentic Chat read-planning telemetry identity', () => {
	it('uses a stable exact-read key independent of argument key order and scheduling sidecars', () => {
		const first = deriveAgenticChatReadPlanningIdentityV1({
			toolName: 'get_document_outline',
			arguments: {
				document_id: 'document-1',
				project_id: 'project-1',
				call_ref: 'outline-a'
			}
		});
		const second = deriveAgenticChatReadPlanningIdentityV1({
			toolName: 'GET_DOCUMENT_OUTLINE',
			arguments: {
				after: ['prior-call'],
				project_id: 'project-1',
				document_id: 'document-1'
			}
		});

		expect(first.executionClass).toBe('evidence_read');
		expect(first.exactReadKey).toMatch(/^[0-9a-f]{64}$/);
		expect(first.exactReadKey).toBe(second.exactReadKey);
		expect(first.resourceKey).toBe(second.resourceKey);
	});

	it('groups distinct projections of one entity without calling them exact duplicates', () => {
		const outline = deriveAgenticChatReadPlanningIdentityV1({
			toolName: 'get_document_outline',
			arguments: { project_id: 'project-1', document_id: 'document-1' }
		});
		const section = deriveAgenticChatReadPlanningIdentityV1({
			toolName: 'read_document_section',
			arguments: {
				project_id: 'project-1',
				document_id: 'document-1',
				anchor: 'pricing'
			}
		});

		expect(outline.exactReadKey).not.toBe(section.exactReadKey);
		expect(outline.resourceKey).toBe(section.resourceKey);
	});

	it('keeps different entity resources distinct', () => {
		const first = deriveAgenticChatReadPlanningIdentityV1({
			toolName: 'get_document_outline',
			arguments: { project_id: 'project-1', document_id: 'document-1' }
		});
		const second = deriveAgenticChatReadPlanningIdentityV1({
			toolName: 'get_document_outline',
			arguments: { project_id: 'project-1', document_id: 'document-2' }
		});

		expect(first.resourceKey).not.toBe(second.resourceKey);
	});

	it('keeps pagination projections distinct while grouping the same collection resource', () => {
		const first = deriveAgenticChatReadPlanningIdentityV1({
			toolName: 'list_project_tasks',
			arguments: { project_id: 'project-1', cursor: 'page-1', limit: 25 }
		});
		const second = deriveAgenticChatReadPlanningIdentityV1({
			toolName: 'list_project_tasks',
			arguments: { project_id: 'project-1', cursor: 'page-2', limit: 25 }
		});

		expect(first.exactReadKey).not.toBe(second.exactReadKey);
		expect(first.resourceKey).toBe(second.resourceKey);
	});

	it('does not derive resource identities from user-authored search text', () => {
		const identity = deriveAgenticChatReadPlanningIdentityV1({
			toolName: 'search_project',
			arguments: { project_id: 'project-1', query: 'private launch language' }
		});

		expect(identity.executionClass).toBe('evidence_read');
		expect(identity.exactReadKey).toMatch(/^[0-9a-f]{64}$/);
		expect(identity.resourceKey).toBeNull();
	});

	it('separates acting controls from independent reviewer decisions', () => {
		expect(
			deriveAgenticChatReadPlanningIdentityV1({
				toolName: 'declare_turn_contract',
				arguments: { outcomes: [] },
				decidedBy: 'acting_model'
			})
		).toEqual({ executionClass: 'control', exactReadKey: null, resourceKey: null });
		expect(
			deriveAgenticChatReadPlanningIdentityV1({
				toolName: 'approve_turn_contract_review',
				arguments: { contract_sha256: 'a'.repeat(64), reason: 'approved' },
				decidedBy: 'contract_reviewer'
			})
		).toEqual({ executionClass: 'review', exactReadKey: null, resourceKey: null });
	});
});
