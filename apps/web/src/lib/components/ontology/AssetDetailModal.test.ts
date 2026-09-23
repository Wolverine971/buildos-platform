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
	if (!Element.prototype.animate) {
		Element.prototype.animate = vi.fn(() => {
			const animation: Partial<Animation> = {
				cancel: vi.fn(),
				play: vi.fn(),
				pause: vi.fn()
			};
			Object.defineProperty(animation, 'finished', {
				value: Promise.resolve(animation as Animation)
			});
			return animation as Animation;
		});
	}
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

	it('hides the picker outside the document tree', async () => {
		mockFetch([]);
		render(AssetDetailModal, {
			props: { isOpen: true, projectId: 'project-1', assetId: 'logo' }
		});

		expect(await screen.findByLabelText('Image name')).toBeInTheDocument();
		expect(screen.queryByLabelText('In document')).toBeNull();
	});
});

describe('AssetDetailModal viewer', () => {
	let calls: Array<{ method: string; url: string; body?: unknown }>;

	beforeEach(() => {
		vi.clearAllMocks();
		stubAnimations();
		calls = [];
		global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? 'GET';
			const body = init?.body ? JSON.parse(String(init.body)) : undefined;
			calls.push({ method, url, body });
			if (method === 'GET') return okJson(assetPayload([]));
			if (method === 'PATCH') {
				return okJson({
					data: { asset: { ...assetPayload([]).data.asset, ...(body as object) } }
				});
			}
			return okJson({ data: {} });
		}) as typeof fetch;
	});

	it('shows only the image, its name, and a download link — no OCR/alt/summary fields', async () => {
		render(AssetDetailModal, {
			props: { isOpen: true, projectId: 'project-1', assetId: 'logo' }
		});

		const name = (await screen.findByLabelText('Image name')) as HTMLInputElement;
		expect(name.value).toBe('Redline logo');
		expect(screen.getByRole('link', { name: 'Download image' })).toHaveAttribute(
			'href',
			'/api/onto/assets/logo/render?download=1'
		);
		expect(screen.queryByLabelText(/alt text/i)).toBeNull();
		expect(screen.queryByLabelText(/summary/i)).toBeNull();
		expect(screen.queryByLabelText(/extracted text/i)).toBeNull();
		expect(screen.queryByText('REDLINE')).toBeNull();
	});

	it('renames on Enter with a single caption PATCH', async () => {
		const onUpdated = vi.fn();
		render(AssetDetailModal, {
			props: { isOpen: true, projectId: 'project-1', assetId: 'logo', onUpdated }
		});

		const name = (await screen.findByLabelText('Image name')) as HTMLInputElement;
		name.focus();
		await fireEvent.input(name, { target: { value: 'Redline primary logo' } });
		await fireEvent.keyDown(name, { key: 'Enter' });
		await fireEvent.blur(name);

		await waitFor(() => expect(onUpdated).toHaveBeenCalled());
		expect(calls.filter((call) => call.method !== 'GET')).toEqual([
			{
				method: 'PATCH',
				url: '/api/onto/assets/logo',
				body: { caption: 'Redline primary logo' }
			}
		]);
	});

	it('reverts the name on Escape without saving or closing', async () => {
		const onClose = vi.fn();
		render(AssetDetailModal, {
			props: { isOpen: true, projectId: 'project-1', assetId: 'logo', onClose }
		});

		const name = (await screen.findByLabelText('Image name')) as HTMLInputElement;
		name.focus();
		await fireEvent.input(name, { target: { value: 'Oops' } });
		await fireEvent.keyDown(name, { key: 'Escape' });
		await fireEvent.blur(name);

		await waitFor(() => expect(name.value).toBe('Redline logo'));
		expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
		expect(onClose).not.toHaveBeenCalled();
	});
});

describe('AssetDetailModal gallery', () => {
	let calls: Array<{ method: string; url: string }>;

	beforeEach(() => {
		vi.clearAllMocks();
		stubAnimations();
		calls = [];
		global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? 'GET';
			calls.push({ method, url });
			const id = /\/api\/onto\/assets\/([^/?]+)$/.exec(url)?.[1];
			if (method === 'GET' && id) {
				return okJson({
					data: {
						asset: {
							...assetPayload([]).data.asset,
							id,
							caption: `Image ${id}`
						},
						links: []
					}
				});
			}
			return okJson({ data: {} });
		}) as typeof fetch;
	});

	function renderGallery(props: Record<string, unknown> = {}) {
		return render(AssetDetailModal, {
			props: {
				isOpen: true,
				projectId: 'project-1',
				assetId: 'a',
				assetIds: ['a', 'b', 'c'],
				...props
			}
		});
	}

	it('steps through images with the arrows and wraps at the ends', async () => {
		renderGallery();

		expect(await screen.findByDisplayValue('Image a')).toBeInTheDocument();
		expect(screen.getByText('1 / 3')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
		expect(await screen.findByDisplayValue('Image b')).toBeInTheDocument();
		expect(screen.getByText('2 / 3')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));
		expect(await screen.findByDisplayValue('Image c')).toBeInTheDocument();
		expect(screen.getByText('3 / 3')).toBeInTheDocument();
	});

	it('jumps with thumbnails and the arrow keys', async () => {
		renderGallery();
		await screen.findByDisplayValue('Image a');

		await fireEvent.click(screen.getByRole('button', { name: 'Show image 3 of 3' }));
		expect(await screen.findByDisplayValue('Image c')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Show image 3 of 3' })).toHaveAttribute(
			'aria-current',
			'true'
		);

		await fireEvent.keyDown(window, { key: 'ArrowRight' });
		expect(await screen.findByDisplayValue('Image a')).toBeInTheDocument();
	});

	it('ignores arrow keys while the name is being edited', async () => {
		renderGallery();
		const name = await screen.findByDisplayValue('Image a');

		await fireEvent.keyDown(name, { key: 'ArrowRight' });

		expect(screen.getByText('1 / 3')).toBeInTheDocument();
	});

	it('shows no arrows or strip for a single image', async () => {
		renderGallery({ assetIds: ['a'] });
		await screen.findByDisplayValue('Image a');

		expect(screen.queryByRole('button', { name: 'Next image' })).toBeNull();
		expect(screen.queryByRole('button', { name: /Show image/ })).toBeNull();
		expect(screen.queryByText('1 / 1')).toBeNull();
	});

	it('moves to the next image after a delete instead of closing', async () => {
		const onClose = vi.fn();
		const onDeleted = vi.fn();
		renderGallery({ onClose, onDeleted });
		await screen.findByDisplayValue('Image a');

		await fireEvent.click(screen.getByRole('button', { name: 'More image actions' }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Delete image' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Delete image' }));

		expect(await screen.findByDisplayValue('Image b')).toBeInTheDocument();
		expect(calls).toContainEqual({ method: 'DELETE', url: '/api/onto/assets/a' });
		expect(onDeleted).toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByText('1 / 2')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Show image 3 of 3' })).toBeNull();
	});

	it('zooms only on click, never on hover, and resets when stepping away', async () => {
		const { container } = renderGallery();
		await screen.findByDisplayValue('Image a');
		const stageImage = () =>
			container.ownerDocument.querySelector(
				'img[src="/api/onto/assets/a/render?width=2500"], img[src="/api/onto/assets/b/render?width=2500"]'
			) as HTMLImageElement;

		await fireEvent.pointerMove(stageImage(), { pointerType: 'mouse' });
		expect(stageImage().style.transform).toBe('scale(1)');

		await fireEvent.click(stageImage());
		expect(stageImage().style.transform).toBe('scale(2)');
		expect(stageImage()).toHaveClass('cursor-zoom-out');

		await fireEvent.click(stageImage());
		expect(stageImage().style.transform).toBe('scale(1)');

		await fireEvent.click(stageImage());
		await fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
		await screen.findByDisplayValue('Image b');
		expect(stageImage().style.transform).toBe('scale(1)');
	});
});
