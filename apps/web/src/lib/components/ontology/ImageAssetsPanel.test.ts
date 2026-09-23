// apps/web/src/lib/components/ontology/ImageAssetsPanel.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ImageAssetsPanel from './ImageAssetsPanel.svelte';

type FetchJson = {
	success?: boolean;
	data?: Record<string, unknown>;
	error?: string;
};

function okJson(payload: FetchJson) {
	return Promise.resolve({
		ok: true,
		status: 200,
		json: async () => payload
	} as Response);
}

function errorJson(status: number, message: string) {
	return Promise.resolve({
		ok: false,
		status,
		json: async () => ({ success: false, error: message })
	} as Response);
}

function assetRow(id = 'asset-1') {
	return {
		id,
		project_id: 'project-1',
		ocr_status: 'complete',
		alt_text: 'Site photo',
		caption: 'Site photo',
		original_filename: 'site.png',
		extracted_text: 'Permit approved',
		extraction_summary: 'Permit screenshot',
		created_at: '2026-02-19T00:00:00.000Z',
		updated_at: '2026-02-19T00:00:00.000Z'
	};
}

describe('ImageAssetsPanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
		window.scrollTo = vi.fn();
		if (!Element.prototype.animate) {
			Element.prototype.animate = vi.fn(() => {
				const animation: Partial<Animation> = {
					cancel: vi.fn(),
					play: vi.fn(),
					pause: vi.fn(),
					currentTime: 0
				};
				Object.defineProperty(animation, 'finished', {
					value: Promise.resolve(animation as Animation)
				});
				setTimeout(() => {
					if (typeof animation.onfinish === 'function') {
						animation.onfinish.call(
							animation as Animation,
							new Event('finish') as AnimationPlaybackEvent
						);
					}
				}, 0);
				return animation as Animation;
			});
		}
	});

	it('renders project images panel content for the project page flow', async () => {
		(global.fetch as any).mockImplementation((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/onto/assets?')) {
				return okJson({ data: { assets: [assetRow()] } });
			}
			return errorJson(404, `Unhandled ${url}`);
		});

		render(ImageAssetsPanel, {
			props: {
				projectId: 'project-1',
				showTitle: false
			}
		});

		await waitFor(() => {
			expect(screen.getByText('Site photo')).toBeInTheDocument();
		});
		expect(screen.getByRole('button', { name: /upload image/i })).toBeInTheDocument();
	});

	it('attaches existing images for task/document entity flow', async () => {
		let attached = false;
		(global.fetch as any).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input), 'http://localhost');
			const method = init?.method || 'GET';

			if (url.pathname === '/api/onto/assets' && method === 'GET') {
				const isEntityQuery = url.searchParams.has('entity_kind');
				if (isEntityQuery) {
					return okJson({ data: { assets: attached ? [assetRow()] : [] } });
				}
				return okJson({ data: { assets: [assetRow()] } });
			}

			if (url.pathname === '/api/onto/assets/asset-1/links' && method === 'POST') {
				attached = true;
				return okJson({ data: { link: { id: 'link-1' } } });
			}

			return errorJson(404, `Unhandled ${method} ${url.pathname}`);
		});

		render(ImageAssetsPanel, {
			props: {
				projectId: 'project-1',
				entityKind: 'task',
				entityId: 'task-1',
				showTitle: false
			}
		});

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /attach existing/i })).toBeInTheDocument();
		});
		await fireEvent.click(screen.getByRole('button', { name: /attach existing/i }));

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Attach' })).toBeInTheDocument();
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Attach' }));

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledWith(
				'/api/onto/assets/asset-1/links',
				expect.objectContaining({ method: 'POST' })
			);
		});
	});

	it('supports picker mode selection for document inline image flow', async () => {
		const onSelectAsset = vi.fn();
		(global.fetch as any).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input), 'http://localhost');
			const method = init?.method || 'GET';

			if (url.pathname === '/api/onto/assets' && method === 'GET') {
				return okJson({ data: { assets: [assetRow()] } });
			}
			if (url.pathname === '/api/onto/assets/asset-1/links' && method === 'POST') {
				return okJson({ data: { link: { id: 'inline-link-1' } } });
			}

			return errorJson(404, `Unhandled ${method} ${url.pathname}`);
		});

		render(ImageAssetsPanel, {
			props: {
				projectId: 'project-1',
				entityKind: 'document',
				entityId: 'doc-1',
				pickerMode: true,
				filterScope: 'project',
				selectLabel: 'Insert',
				onSelectAsset
			}
		});

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Insert' })).toBeInTheDocument();
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Insert' }));

		await waitFor(() => {
			expect(onSelectAsset).toHaveBeenCalledTimes(1);
		});
		expect(global.fetch).toHaveBeenCalledWith(
			'/api/onto/assets/asset-1/links',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('opens the viewer on the clicked image and steps through the panel images', async () => {
		const floorPlan = { ...assetRow('asset-2'), caption: 'Floor plan', alt_text: 'Floor plan' };
		(global.fetch as any).mockImplementation(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(String(input), 'http://localhost');
				const method = init?.method || 'GET';

				if (url.pathname === '/api/onto/assets' && method === 'GET') {
					return okJson({ data: { assets: [assetRow(), floorPlan] } });
				}
				if (url.pathname === '/api/onto/assets/asset-1' && method === 'GET') {
					return okJson({ data: { asset: assetRow(), links: [] } });
				}
				if (url.pathname === '/api/onto/assets/asset-2' && method === 'GET') {
					return okJson({ data: { asset: floorPlan, links: [] } });
				}

				return errorJson(404, `Unhandled ${method} ${url.pathname}`);
			}
		);

		render(ImageAssetsPanel, {
			props: {
				projectId: 'project-1',
				showTitle: false
			}
		});

		await waitFor(() => {
			expect(screen.getByText('Site photo')).toBeInTheDocument();
		});

		await fireEvent.click(screen.getAllByTitle('View image details')[0]!);

		expect(await screen.findByDisplayValue('Site photo')).toBeInTheDocument();
		expect(screen.getByText('1 / 2')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Next image' }));

		expect(await screen.findByDisplayValue('Floor plan')).toBeInTheDocument();
		expect(screen.getByText('2 / 2')).toBeInTheDocument();
	});
});
