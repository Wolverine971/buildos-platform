// apps/mobile/tests/document-save.test.ts
import type { DocumentDetailResponse, ProjectFullResponse } from '@buildos/api-client';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { applyDocumentSave } from '@/hooks/use-entities';

vi.mock('@/lib/api', () => ({ api: {} }));
vi.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: null }) }));

const USER = 'user-1';

function saved(title: string): DocumentDetailResponse {
	return {
		document: { id: 'n1', title, updated_at: '2026-10-29T12:00:00Z' },
		editor_revision: 'rev-2'
	} as unknown as DocumentDetailResponse;
}

describe('applyDocumentSave', () => {
	it('writes the doc, renames it in cached projects and marks the Workspace stale', () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(['desktop', USER], { projects: [], workspace: null });
		queryClient.setQueryData(['desktop', 'someone-else'], { projects: [], workspace: null });
		queryClient.setQueryData(['project', USER, 'ws'], {
			documents: [
				{ id: 'n1', title: 'Old', updated_at: 'x' },
				{ id: 'n2', title: 'Other', updated_at: 'x' }
			],
			context_document: null
		} as unknown as ProjectFullResponse);

		applyDocumentSave(queryClient, USER, 'n1', saved('Call the printer'));

		expect(queryClient.getQueryData(['document', USER, 'n1'])).toEqual(saved('Call the printer'));
		const project = queryClient.getQueryData<ProjectFullResponse>(['project', USER, 'ws']);
		expect(project?.documents.map((doc) => doc.title)).toEqual(['Call the printer', 'Other']);
		// A loose note's title and excerpt live on the Workspace tab: refetched on its next focus.
		expect(queryClient.getQueryState(['desktop', USER])?.isInvalidated).toBe(true);
		expect(queryClient.getQueryState(['desktop', 'someone-else'])?.isInvalidated).toBe(false);
	});
});
