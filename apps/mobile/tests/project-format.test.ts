// apps/mobile/tests/project-format.test.ts
import type { ProjectTasksCoverage } from '@buildos/api-client';
import { describe, expect, it } from 'vitest';

import {
	backTarget,
	countsStamp,
	dueTone,
	editedLabel,
	emojiGlyphs,
	fallbackTile,
	headerTile,
	type ProjectRowLike,
	shortDue,
	shortLabel,
	taskCounts,
	taskGlyph,
	taskRowLabel,
	webProjectUrl
} from '@/components/project/format';

const now = new Date(2026, 9, 29, 15, 0);

describe('dates', () => {
	it('labels due dates for the mono date chip', () => {
		expect(shortDue(new Date(2026, 9, 29, 23, 59).toISOString(), now)).toBe('Today');
		expect(shortDue(new Date(2026, 9, 30, 9).toISOString(), now)).toBe('Tomorrow');
		expect(shortDue(new Date(2026, 9, 27).toISOString(), now)).toMatch(/Oct 27/);
		expect(shortDue(new Date(2027, 0, 3).toISOString(), now)).toMatch(/2027/);
		expect(shortDue(null, now)).toBeNull();
		expect(shortDue('nope', now)).toBeNull();
	});

	it('stamps doc rows with their edit date', () => {
		expect(editedLabel('2026-10-28T12:00:00Z', now)).toMatch(/^Edited Oct 2[78]$/);
		expect(editedLabel(null)).toBe('');
	});
});

describe('counts and glyphs', () => {
	it('counts from bucket totals when the server sends them, else from loaded rows', () => {
		const coverage = {
			total: 54,
			buckets: {
				overdue: { total: 1 },
				in_progress: { total: 2 },
				scheduled: { total: 1 },
				backlog: { total: 7 },
				blocked: { total: 0 },
				done: { total: 43 }
			}
		} as unknown as ProjectTasksCoverage;
		expect(taskCounts(coverage, [])).toEqual({ open: 11, done: 43, total: 54 });
		expect(
			taskCounts(null, [
				{ bucket: 'backlog', tasks: [1, 2] },
				{ bucket: 'done', tasks: [1] }
			])
		).toEqual({ open: 2, done: 1, total: 3 });
		expect(countsStamp({ open: 11, done: 43, total: 54 })).toBe('11 open · 43 done');
	});

	it('shapes the glyph by state and colors it by bucket', () => {
		expect(taskGlyph('overdue', 'in_progress')).toEqual({ shape: 'dot', tone: 'destructive' });
		expect(taskGlyph('blocked', 'blocked')).toEqual({ shape: 'slash', tone: 'warning' });
		expect(taskGlyph('done', 'done')).toEqual({ shape: 'check', tone: 'success' });
		expect(taskGlyph('scheduled', 'todo')).toEqual({ shape: 'circle', tone: 'info' });
		expect(dueTone('overdue')).toBe('destructive');
		expect(taskRowLabel('Ship', 'backlog', null)).toBe('Ship, to do');
	});
});

describe('header tile', () => {
	const row: ProjectRowLike = {
		id: 'p1',
		name: 'BuildOS',
		kind: 'project',
		state_key: 'active',
		updated_at: 'x',
		next_step_short: null,
		parent_project_id: null,
		icon_emoji: { glyphs: ['🧠'] }
	};

	it('reads at most two emoji glyphs', () => {
		expect(emojiGlyphs({ glyphs: [' 🧠 ', '🗂️', '🎯'] })).toEqual(['🧠', '🗂️']);
		expect(emojiGlyphs({ glyphs: [] })).toBeNull();
		expect(emojiGlyphs(null)).toBeNull();
	});

	it('uses the desktop entry for the look and the project row for the name', () => {
		expect(headerTile(row, null)?.emoji).toEqual(['🧠']);
		expect(headerTile({ ...row, kind: 'workspace' }, null)).toBeNull();
		const entry = { ...fallbackTile(row), pulse: 'moving' as const, emoji: null, name: 'Old' };
		const tile = headerTile(row, entry);
		expect(tile?.pulse).toBe('moving');
		expect(tile?.name).toBe('BuildOS');
		expect(tile?.emoji).toEqual(['🧠']);
		expect(headerTile(null, entry)).toBe(entry);
	});
});

describe('backTarget', () => {
	// The navigator a project sees is its tab's stack: the tab's root, then any projects.
	const root = (name: 'index' | 'projects') => ({ name, key: 'root' });
	const project = (key: string, id: string) => ({ name: 'project/[id]', key, params: { id } });

	it('names the tab whose stack the project is on', () => {
		expect(
			backTarget({ index: 1, routes: [root('projects'), project('me', 'p1')] }, 'me', 'workspace')
		).toEqual({ kind: 'workspace' });
		expect(
			backTarget({ index: 1, routes: [root('index'), project('me', 'p1')] }, 'me', 'today')
		).toEqual({ kind: 'today' });
	});

	it('names the parent project under a sub-project, in either tab', () => {
		const routes = [root('index'), project('a', 'p0'), project('me', 'p1')];
		expect(backTarget({ index: 2, routes }, 'me', 'today')).toEqual({ kind: 'project', id: 'p0' });
		expect(backTarget({ index: 2, routes }, 'a', 'today')).toEqual({ kind: 'today' });
	});

	it('skips preloaded peeks; a preloaded screen sits on top of the stack', () => {
		const peek = { ...project('pre', 'x'), isPreloaded: true };
		expect(
			backTarget(
				{ index: 2, routes: [root('projects'), peek, project('me', 'p1')] },
				'me',
				'workspace'
			)
		).toEqual({ kind: 'workspace' });
		// Opened by a peek over another project: back goes to that project.
		expect(
			backTarget(
				{ index: 1, routes: [root('projects'), project('a', 'p0'), peek] },
				'pre',
				'workspace'
			)
		).toEqual({ kind: 'project', id: 'p0' });
		// Routes past the focused index are preloads even without the flag.
		expect(
			backTarget({ index: 0, routes: [root('index'), project('pre', 'x')] }, 'pre', 'today')
		).toEqual({ kind: 'today' });
	});

	it('falls back to the tab when it cannot tell', () => {
		expect(backTarget(undefined, 'me', 'today')).toEqual({ kind: 'today' });
		expect(backTarget({ routes: [project('me', 'p1')] }, 'me', 'workspace')).toEqual({
			kind: 'workspace'
		});
		expect(
			backTarget(
				{ index: 2, routes: [root('index'), { name: 'project/[id]', key: 'a' }, project('me', 'p1')] },
				'me',
				'today'
			)
		).toEqual({ kind: 'today' });
	});
});

describe('labels and links', () => {
	it('shortens long names and builds the web link', () => {
		expect(webProjectUrl('https://build-os.com/', 'a b')).toBe(
			'https://build-os.com/projects/a%20b'
		);
		expect(shortLabel('Short')).toBe('Short');
		expect(shortLabel('A very long project name here')).toBe('A very long proje…');
	});
});
