// apps/web/src/lib/components/ontology/AssetDetailModal.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import AssetDetailModal from './AssetDetailModal.svelte';

function okJson(payload: Record<string, unknown>) {
	return Promise.resolve({ ok: true, status: 200, json: async () => payload } as Response);
}

const DOCUMENTS = [
	{ id: 'doc-brand', title: 'Brand guide', depth: 0 },
	{ id: 'doc-site', title: 'Website copy', depth: 1 }
];

function assetPayload(links: Array<{ entity_id: string; role: string }>) {
	return {
		data: {
			asset: {
				id: 'logo',
				project_id: 'project-1',
				caption: 'Redline logo',
				alt_text: null,
				original_filename: 'logo.png',
				ocr_status: 'complete',
				extracted_text: 'REDLINE',
				extraction_summary: 'Company logo'
			},
			links: links.map((link, index) => ({
				id: `link-${index}`,
				asset_id: 'logo',
				project_id: 'project-1',
				entity_kind: 'document',
				entity_id: link.entity_id,
				role: link.role
			}))
		}
	};
}

function stubAnimations() {
	window.scrollTo = vi.fn();
	if (Element.prototype.animate) return;
	Element.prototype.animate = vi.fn(() => {
		const animation: Partial<Animation> = { cancel: vi.fn(), play: vi.fn(), pause: vi.fn() };
		Object.defineProperty(animation, 'finished', {
			value: Promise.resolve(animation as Animation)
		});
		return animation as Animation;
	});
}

describe('AssetDetailModal document placement', () => {
	let calls: Array<{ method: string; url: string; body?: unknown }>;

	function mockFetch(initialLinks: Array<{ entity_id: string; role: string }>) {
		calls = [];
		global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? 'GET';
			calls.push({
				method,
				url,
				body: init?.body ? JSON.parse(String(init.body)) : undefined
			});
			if (method === 'GET' && url === '/api/onto/assets/logo') {
				return okJson(assetPayload(initialLinks));
			}
			return okJson({ data: {} });
		}) as typeof fetch;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		stubAnimations();
	});

	it('moves the image from one document to another, keeping inline embeds', async () => {
		mockFetch([
			{ entity_id: 'doc-brand', role: 'attachment' },
			{ entity_id: 'doc-brand', role: 'inline' }
		]);
		const onUpdated = vi.fn();
		render(AssetDetailModal, {
			props: {
				isOpen: true,
				projectId: 'project-1',
				assetId: 'logo',
				documentOptions: DOCUMENTS,
				onUpdated
			}
		});

		const picker = (await screen.findByLabelText('In document')) as HTMLSelectElement;
		await waitFor(() => expect(picker.value).toBe('doc-brand'));

		await fireEvent.change(picker, { target: { value: 'doc-site' } });

		await waitFor(() => expect(onUpdated).toHaveBeenCalled());
		const writes = calls.filter((call) => call.method !== 'GET');
		expect(writes).toEqual([
			{
				method: 'POST',
				url: '/api/onto/assets/logo/links',
				body: { entity_kind: 'document', entity_id: 'doc-site', role: 'attachment' }
			},
			{
				method: 'DELETE',
				url: '/api/onto/assets/logo/links?entity_kind=document&entity_id=doc-brand&role=attachment',
				body: undefined
			}
		]);
	});

	it('returns the image to the Images shelf by removing its document attachment', async () => {
		mockFetch([{ entity_id: 'doc-brand', role: 'attachment' }]);
		render(AssetDetailModal, {
			props: {
				isOpen: true,
				projectId: 'project-1',
				assetId: 'logo',
				documentOptions: DOCUMENTS,
				onUpdated: vi.fn()
			}
		});

		const picker = (await screen.findByLabelText('In document')) as HTMLSelectElement;
		await waitFor(() => expect(picker.value).toBe('doc-brand'));

		await fireEvent.change(picker, { target: { value: '' } });

		await waitFor(() =>
			expect(calls.filter((call) => call.method !== 'GET')).toEqual([
				{
					method: 'DELETE',
					url: '/api/onto/assets/logo/links?entity_kind=document&entity_id=doc-brand&role=attachment',
					body: undefined
				}
			])
		);
	});

	it('hides the picker and keeps the Caption label outside the document tree', async () => {
		mockFetch([]);
		render(AssetDetailModal, {
			props: { isOpen: true, projectId: 'project-1', assetId: 'logo' }
		});

		expect(await screen.findByLabelText('Caption')).toBeInTheDocument();
		expect(screen.queryByLabelText('In document')).toBeNull();
	});
});
