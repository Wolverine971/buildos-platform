// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Node } from '@xyflow/svelte';
import QuestionTreeViewportAnchor from './QuestionTreeViewportAnchor.svelte';

const flow = vi.hoisted(() => ({
	fitView: vi.fn(),
	getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 0.5 })),
	setCenter: vi.fn(),
	setViewport: vi.fn()
}));

vi.mock('@xyflow/svelte', () => ({
	useSvelteFlow: () => flow
}));

function graphNode(id: string, x: number, y: number): Node {
	return { id, position: { x, y }, data: {} } as Node;
}

describe('QuestionTreeViewportAnchor', () => {
	let frames: Map<number, FrameRequestCallback>;
	let nextFrameId: number;

	beforeEach(() => {
		frames = new Map();
		nextFrameId = 1;
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			const id = nextFrameId++;
			frames.set(id, callback);
			return id;
		});
		vi.stubGlobal('cancelAnimationFrame', (id: number) => {
			frames.delete(id);
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	async function flushAnimationFrames(): Promise<void> {
		const pending = [...frames.values()];
		frames.clear();
		for (const callback of pending) callback(0);
		await tick();
	}

	it('fits the latest bootstrap graph when nodes arrive before the first frame', async () => {
		const root = graphNode('root', 0, 0);
		const child = graphNode('child', 350, 0);
		const view = render(QuestionTreeViewportAnchor, {
			props: { nodes: [root], selectedNodeId: 'root', initialNodeIds: ['root'] }
		});
		await tick();

		await view.rerender({
			nodes: [root, child],
			selectedNodeId: 'root',
			initialNodeIds: ['root', 'child']
		});
		await flushAnimationFrames();

		expect(flow.fitView).toHaveBeenCalledOnce();
		expect(flow.fitView.mock.calls[0]?.[0].nodes.map((node: Node) => node.id)).toEqual([
			'root',
			'child'
		]);
	});

	it('keeps a selected-node camera update queued across presentation refreshes', async () => {
		const root = graphNode('root', 0, 0);
		const child = graphNode('child', 350, 80);
		const view = render(QuestionTreeViewportAnchor, {
			props: {
				nodes: [root, child],
				selectedNodeId: 'root',
				initialNodeIds: ['root', 'child']
			}
		});
		await tick();
		await flushAnimationFrames();

		await view.rerender({
			nodes: [root, child],
			selectedNodeId: 'child',
			initialNodeIds: ['root', 'child']
		});
		await view.rerender({
			nodes: [{ ...root }, { ...child }],
			selectedNodeId: 'child',
			initialNodeIds: ['root', 'child']
		});
		await flushAnimationFrames();

		expect(flow.setCenter).toHaveBeenCalledOnce();
		expect(flow.setCenter).toHaveBeenCalledWith(475, 146, {
			zoom: 0.72,
			duration: 220
		});
	});
});
