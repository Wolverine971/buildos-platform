// apps/web/src/lib/builder-profile/builder-profile-helpers.test.ts
import { describe, expect, it } from 'vitest';
import { detectPlatform, displayUrl, normalizeLinkUrl, socialHandle } from './links';
import { activeLabel, buildLogGrid, initialsOf, levelFor, stageLabel } from './format';
import { toAgentJson } from './agent-json';
import type { BuilderProfileView } from './types';

describe('links', () => {
	it('adds https to bare hosts and keeps http(s) links', () => {
		expect(normalizeLinkUrl('x.com/djwayne3')).toBe('https://x.com/djwayne3');
		expect(normalizeLinkUrl('  https://9takes.com  ')).toBe('https://9takes.com/');
		expect(normalizeLinkUrl('http://example.com/a')).toBe('http://example.com/a');
	});

	it('refuses other schemes, spaces, credentials and hostless input', () => {
		expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
		expect(normalizeLinkUrl('data:text/html,hi')).toBeNull();
		expect(normalizeLinkUrl('mailto:me@example.com')).toBeNull();
		expect(normalizeLinkUrl('https://user:pw@example.com')).toBeNull();
		expect(normalizeLinkUrl('not a link')).toBeNull();
		expect(normalizeLinkUrl('localhost')).toBeNull();
		expect(normalizeLinkUrl('')).toBeNull();
	});

	it('recognizes platforms by host', () => {
		expect(detectPlatform('https://twitter.com/djwayne3')).toBe('x');
		expect(detectPlatform('https://www.linkedin.com/in/djwayne')).toBe('linkedin');
		expect(detectPlatform('https://dj.substack.com')).toBe('substack');
		expect(detectPlatform('https://youtu.be/abc')).toBe('youtube');
		expect(detectPlatform('https://build-os.com')).toBe('website');
	});

	it('shows links without the scheme and pulls a handle', () => {
		expect(displayUrl('https://www.x.com/djwayne3/')).toBe('x.com/djwayne3');
		expect(socialHandle('https://x.com/djwayne3')).toBe('@djwayne3');
		expect(socialHandle('https://linkedin.com/in/djwayne')).toBe('in/djwayne');
		expect(socialHandle('https://tiktok.com/@djwayne3')).toBe('@djwayne3');
	});
});

describe('format', () => {
	const now = new Date('2026-10-23T15:00:00');

	it('describes how recently a project moved', () => {
		expect(activeLabel('2026-10-23T09:00:00', now)).toBe('active today');
		expect(activeLabel('2026-10-22T09:00:00', now)).toBe('active yesterday');
		expect(activeLabel('2026-10-18T09:00:00', now)).toBe('active 5 days ago');
		expect(activeLabel('2026-09-30T09:00:00', now)).toBe('active 3 weeks ago');
		expect(activeLabel('2026-07-14T09:00:00', now)).toBe('quiet since July');
		expect(activeLabel('2025-07-14T09:00:00', now)).toBe('quiet since July 2025');
		expect(activeLabel(null, now)).toBe('no activity yet');
	});

	it('labels stages, letting paused and done projects say so', () => {
		expect(stageLabel({ stage: 'execution', state: 'active' })).toBe('Building');
		expect(stageLabel({ stage: 'discovery' })).toBe('Exploring');
		expect(stageLabel({ stage: 'execution', state: 'paused' })).toBe('Paused');
		expect(stageLabel({})).toBe('Building');
	});

	it('makes initials from a name or handle', () => {
		expect(initialsOf('DJ Wayne', 'djwayne')).toBe('DW');
		expect(initialsOf(null, 'djwayne')).toBe('DJ');
	});

	it('builds 53 Sunday-first weeks ending today, with year totals', () => {
		const grid = buildLogGrid({
			includes_private: false,
			show_agent_split: true,
			today: '2026-10-23',
			days: [
				['2026-10-23', 10, 5],
				['2026-10-17', 44, 29],
				['2025-10-01', 99, 0] // older than a year: outside the grid and totals
			]
		});
		expect(grid.weeks.length).toBe(53);
		expect(grid.weeks.every((w) => w.length === 7)).toBe(true);
		const last = grid.weeks[grid.weeks.length - 1];
		const today = last.find((c) => c.date === '2026-10-23');
		expect(today).toMatchObject({ changes: 10, byAgents: 5, agentPercent: 50, future: false });
		expect(last.find((c) => c.date === '2026-10-24')?.future).toBe(true);
		expect(grid.activeDays).toBe(2);
		expect(grid.changes).toBe(54);
		expect(grid.agentPercent).toBe(63);
	});

	it('drops the agent tone when the owner turns the split off', () => {
		const grid = buildLogGrid({
			includes_private: false,
			show_agent_split: false,
			today: '2026-10-23',
			days: [['2026-10-23', 10, 5]]
		});
		expect(grid.weeks.at(-1)?.find((c) => c.date === '2026-10-23')?.agentPercent).toBe(0);
	});

	it('buckets day intensity', () => {
		expect([0, 1, 4, 10, 25].map(levelFor)).toEqual([0, 1, 2, 3, 4]);
	});
});

describe('agent json', () => {
	const view: BuilderProfileView = {
		found: true,
		status: 'published',
		viewer: { signed_in: false, is_owner: false, works_with: false, follows: false, ask_pending: false },
		profile: { handle: 'djwayne', name: 'DJ Wayne', headline: 'Founder, BuildOS', now_text: 'Building.' },
		settings: { show_build_log: true, show_agent_split: true, show_writing: true, show_builds_with: true },
		links: [{ id: 'l1', kind: 'social', url: 'https://x.com/djwayne3', audience: 'anyone' }],
		projects: [
			{
				id: 'p1',
				level: 'live',
				name: '9takes',
				pitch: 'Enneagram discussions.',
				stage: 'execution',
				audience: 'anyone',
				goals: ['Every new take gets a reply'],
				looking_for: 'Beta testers'
			},
			{ id: 'p2', level: 'listed', name: 'Radar', audience: 'anyone', stage: 'execution' }
		],
		activity: {
			includes_private: false,
			show_agent_split: true,
			today: '2026-10-23',
			days: [
				['2026-10-17', 40, 10],
				['2026-10-23', 10, 0]
			]
		},
		writing: [{ title: 'Julian Episode 390', url_path: '/p/dj-wayne/julian-pod-390' }],
		builds_with: []
	};

	it('gives agents the visitor view as data with a way to ask', () => {
		const json = toAgentJson(view, 'https://build-os.com/');
		expect(json.url).toBe('https://build-os.com/@djwayne');
		expect(json.projects[0]).toMatchObject({
			name: '9takes',
			stage: 'building',
			goals: ['Every new take gets a reply'],
			looking_for: 'Beta testers',
			you_can: ['follow', 'ask_to_join']
		});
		expect(json.projects[1]).not.toHaveProperty('you_can');
		expect(json.activity_last_year).toEqual({ active_days: 2, changes: 50, with_agents_pct: 20 });
		expect(json.writing[0].url).toBe('https://build-os.com/p/dj-wayne/julian-pod-390');
		expect(json.how_to_ask).toContain('request_buildos_access');
	});
});
