// apps/web/src/lib/components/organize/useOrganizeDrag.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOrganizeDrag } from './useOrganizeDrag.svelte';
import { organizeFixtures } from './organize-fixtures';

const ref = { kind: 'document' as const, id: 'brief', project_id: 'source' };
const event = (x: number, y: number, pointerType = 'mouse') =>
	({
		button: 0,
		pointerId: 1,
		clientX: x,
		clientY: y,
		pointerType,
		preventDefault: vi.fn()
	}) as unknown as PointerEvent;

describe('cross-pane pointer drag', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});
	function setup() {
		const onDrop = vi.fn();
		const drag = createOrganizeDrag({ getProjects: organizeFixtures, onDrop });
		const target = document.createElement('button');
		target.dataset.organizeDrop = '';
		target.dataset.projectId = 'dest';
		target.dataset.documentId = 'shared';
		target.getBoundingClientRect = () => ({ top: 0, height: 100 }) as DOMRect;
		document.body.append(target);
		Object.defineProperty(document, 'elementFromPoint', {
			configurable: true,
			value: vi.fn(() => target)
		});
		return { drag, onDrop };
	}
	it('shares the document tree middle-zone rule and stages only on release', () => {
		const { drag, onDrop } = setup();
		drag.start(event(0, 0), ref);
		drag.move(event(2, 2));
		expect(drag.active).toBeNull();
		drag.move(event(20, 50));
		expect(drag.target).toMatchObject({
			destination_project_id: 'dest',
			parent_id: 'shared',
			position: 0
		});
		expect(onDrop).not.toHaveBeenCalled();
		drag.end(event(20, 50));
		expect(onDrop).toHaveBeenCalledExactlyOnceWith({
			...ref,
			destination_project_id: 'dest',
			parent_id: 'shared',
			position: 0
		});
		expect(drag.active).toBeNull();
	});
	it('clears stale targets on pointer cancel and lets touches scroll', () => {
		const { drag, onDrop } = setup();
		drag.start(event(0, 0), ref);
		drag.move(event(20, 50));
		drag.cancel();
		drag.end(event(20, 50));
		drag.start(event(0, 0, 'touch'), ref);
		drag.move(event(20, 50, 'touch'));
		drag.end(event(20, 50, 'touch'));
		expect(onDrop).not.toHaveBeenCalled();
	});
});
