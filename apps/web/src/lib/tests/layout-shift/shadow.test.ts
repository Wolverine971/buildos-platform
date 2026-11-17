// apps/web/src/lib/tests/layout-shift/shadow.test.ts
import { describe, expect, it } from 'vitest';
import { applyWrite, createShadowState, overlayJson } from './shadow';

describe('shadow server', () => {
	it('answers a status change and makes later reads agree', () => {
		const shadow = createShadowState();
		const answer = applyWrite(shadow, 'PATCH', '/api/onto/tasks/t1', { state_key: 'done' });
		expect(answer).toMatchObject({ task: { id: 't1', state_key: 'done' } });

		const read = {
			success: true,
			data: {
				project: {
					tasks: [
						{ id: 't1', state_key: 'todo', completed_at: null },
						{ id: 't2', state_key: 'todo', completed_at: null }
					]
				}
			}
		};
		const patched = overlayJson(read, shadow) as typeof read;
		expect(patched.data.project.tasks[0]).toMatchObject({ state_key: 'done' });
		expect(patched.data.project.tasks[0]!.completed_at).toBeTruthy();
		expect(patched.data.project.tasks[1]).toMatchObject({ state_key: 'todo' });
	});

	it('drops archived items from every list', () => {
		const shadow = createShadowState();
		applyWrite(shadow, 'DELETE', '/api/onto/tasks/t1', { archive: true });
		applyWrite(shadow, 'PATCH', '/api/onto/documents/d1', { action: 'archive' });
		const patched = overlayJson(
			{ tasks: [{ id: 't1' }, { id: 't2' }], documents: [{ id: 'd1' }] },
			shadow
		);
		expect(patched).toEqual({ tasks: [{ id: 't2' }], documents: [] });
		expect(shadow.writes).toHaveLength(2);
	});

	it('records writes it does not understand without touching reads', () => {
		const shadow = createShadowState();
		expect(applyWrite(shadow, 'POST', '/api/analytics/event', { name: 'x' })).toEqual({});
		expect(overlayJson({ id: 'x', state_key: 'todo' }, shadow)).toEqual({
			id: 'x',
			state_key: 'todo'
		});
	});
});
