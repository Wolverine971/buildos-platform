// apps/web/src/lib/components/projects/desktop/DesktopTile.test.ts
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectListSummary } from '../project-list';
import { tileGlyphs } from '$lib/components/project/emoji/project-emoji';
import DesktopTile from './DesktopTile.svelte';

const project = (extra: Partial<ProjectListSummary> = {}) =>
	({ id: 'bep', name: 'Beyond Exit Planning', ...extra }) as ProjectListSummary;

const face = (container: HTMLElement) => container.querySelector('.mono')?.textContent?.trim();

describe('DesktopTile', () => {
	afterEach(cleanup);

	it('shows the project’s two emojis instead of its initials', () => {
		const { container } = render(DesktopTile, { project: project({ emoji: ['💰', '🚪'] }) });
		expect(face(container)).toBe('💰🚪');
		expect(container.querySelector('.emoji.pair')).toBeTruthy();
	});

	it('shows only the first emoji at dock sizes', () => {
		const { container } = render(DesktopTile, {
			project: project({ emoji: ['💰', '🚪'] }),
			size: 'sm'
		});
		expect(face(container)).toBe('💰');
	});

	it('keeps the initials until the project has a pick', () => {
		const { container } = render(DesktopTile, { project: project({ emoji: null }) });
		expect(face(container)).toBe('BE');
	});
});

describe('tileGlyphs', () => {
	it('keeps at most two short strings', () => {
		expect(tileGlyphs(['💰', ' 🚪 ', '🧭'])).toEqual(['💰', '🚪']);
		expect(tileGlyphs(['💰', 7, '', 'x'.repeat(40)])).toEqual(['💰']);
		expect(tileGlyphs('💰🚪')).toBeNull();
		expect(tileGlyphs([])).toBeNull();
	});
});
