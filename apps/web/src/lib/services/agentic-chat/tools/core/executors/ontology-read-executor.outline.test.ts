// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.outline.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntologyReadExecutor } from './ontology-read-executor';
import type { ExecutorContext } from './types';

const DOC_CONTENT = `# Marketing Plan

intro

## Channels
channel body

### Instagram
ig body

## Budget
budget body`;

function createDocQuery(result: Record<string, unknown>) {
	const query: Record<string, any> = {};
	query.select = vi.fn(() => query);
	query.eq = vi.fn(() => query);
	query.is = vi.fn(() => query);
	query.maybeSingle = vi.fn(() => Promise.resolve(result));
	return query;
}

describe('OntologyReadExecutor — document outline & section (Project Knowledge Layer L2)', () => {
	let mockSupabase: SupabaseClient<Database>;
	let context: ExecutorContext;

	beforeEach(() => {
		mockSupabase = {
			auth: {
				getSession: vi.fn().mockResolvedValue({
					data: { session: { access_token: 'test-token' } }
				})
			},
			rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
			from: vi.fn(() =>
				createDocQuery({
					data: {
						id: 'doc-1',
						project_id: 'project-1',
						title: 'Marketing Plan',
						content: DOC_CONTENT,
						props: {},
						state_key: 'draft',
						type_key: 'document.default'
					},
					error: null
				})
			)
		} as unknown as SupabaseClient<Database>;

		context = {
			supabase: mockSupabase,
			userId: 'user-1',
			sessionId: 'session-1',
			fetchFn: vi.fn() as unknown as typeof fetch
		};
	});

	it('getDocumentOutline returns the heading tree with anchors, not the body', async () => {
		const executor = new OntologyReadExecutor(context);
		const result = await executor.getDocumentOutline({ document_id: 'doc-1' });

		expect(result.document_id).toBe('doc-1');
		expect(result.outline?.[0]?.anchor).toBe('marketing-plan');
		const channels = result.outline?.[0]?.children?.find((n: any) => n.text === 'Channels');
		expect(channels?.anchor).toBe('channels');
		// outline carries structure, not full prose body
		expect(JSON.stringify(result.outline)).not.toContain('channel body');
	});

	it('readDocumentSection returns only the requested section', async () => {
		const executor = new OntologyReadExecutor(context);
		const result = await executor.readDocumentSection({
			document_id: 'doc-1',
			anchor: 'channels'
		});

		expect(result.found).not.toBe(false);
		expect(result.heading).toBe('Channels');
		expect(result.content).toContain('channel body');
		expect(result.content).toContain('### Instagram'); // nested child included
		expect(result.content).not.toContain('## Budget'); // sibling excluded
	});

	it('readDocumentSection reports available anchors on a miss', async () => {
		const executor = new OntologyReadExecutor(context);
		const result = await executor.readDocumentSection({
			document_id: 'doc-1',
			anchor: 'nonexistent'
		});

		expect(result.found).toBe(false);
		expect(result.available_anchors).toContain('channels');
		expect(result.available_anchors).toContain('budget');
	});

	it('returns a not-found payload when the document is missing', async () => {
		(mockSupabase as any).from = vi.fn(() => createDocQuery({ data: null, error: null }));
		const executor = new OntologyReadExecutor(context);
		const result = await executor.getDocumentOutline({ document_id: 'missing' });
		expect(result.status).toBe('not_found');
	});
});
