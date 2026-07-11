// packages/shared-agent-ops/src/ontology/start-here.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildStartHerePromptExcerpt,
	buildStartHereTemplate,
	extractStartHereOrientation,
	parseStartHereStatusRegion,
	renderStartHereManagedRegion,
	renderStartHereStatusContent
} from './start-here';

const renderedStatusBody = [
	'# START HERE - Demo',
	'',
	renderStartHereManagedRegion({
		name: 'status',
		content: renderStartHereStatusContent({
			state: 'Active',
			stage: 'execution',
			openTasks: 4,
			overdueTasks: 1,
			nextStep: 'Ship the launch email.',
			refreshedAt: '2026-07-10T04:00:00.000Z'
		})
	}),
	'',
	'## What this is',
	'A demo project used for parser tests. It exists to verify orientation extraction.',
	'',
	'## Current state',
	'Mid-flight.'
].join('\n');

describe('parseStartHereStatusRegion', () => {
	it('round-trips a rendered status region', () => {
		const status = parseStartHereStatusRegion(renderedStatusBody);
		expect(status).not.toBeNull();
		expect(status?.state).toBe('Active');
		expect(status?.stage).toBe('execution');
		expect(status?.now).toContain('4 open tasks');
		expect(status?.now).toContain('1 overdue');
		expect(status?.nextStep).toBe('Ship the launch email.');
		expect(status?.refreshedAt).toBe('2026-07-10T04:00:00.000Z');
		expect(status?.rendered).toBe(true);
	});

	it('flags the never-rendered template as not rendered and nulls placeholders', () => {
		const body = buildStartHereTemplate({ projectName: 'Demo' });
		const status = parseStartHereStatusRegion(body);
		expect(status).not.toBeNull();
		expect(status?.rendered).toBe(false);
		expect(status?.state).toBeNull();
		expect(status?.now).toBeNull();
		expect(status?.nextStep).toBeNull();
		expect(status?.refreshedAt).toBeNull();
	});

	it('returns null when the body has no status region', () => {
		expect(parseStartHereStatusRegion('# Some doc\n\nJust prose.')).toBeNull();
	});
});

describe('extractStartHereOrientation', () => {
	it('prefers the What this is section', () => {
		const orientation = extractStartHereOrientation(renderedStatusBody);
		expect(orientation).toBe(
			'A demo project used for parser tests. It exists to verify orientation extraction.'
		);
	});

	it('reads the instantiation Vision & Summary dialect', () => {
		const body = [
			'# Herb Garden Context Document',
			'',
			'## Vision & Summary',
			'',
			'Set up a small balcony herb garden by end of July.',
			'',
			'## Initial Tasks / Threads',
			'- Buy pots · todo'
		].join('\n');
		expect(extractStartHereOrientation(body)).toBe(
			'Set up a small balcony herb garden by end of July.'
		);
	});

	it('skips managed regions, headings, and placeholder scaffolding', () => {
		const body = buildStartHereTemplate({ projectName: 'Empty' });
		expect(extractStartHereOrientation(body)).toBeNull();
	});

	it('truncates to maxChars', () => {
		const body = ['## What this is', 'word '.repeat(100)].join('\n');
		const orientation = extractStartHereOrientation(body, 40);
		expect(orientation).not.toBeNull();
		expect(orientation!.length).toBeLessThanOrEqual(40);
	});
});

describe('legacy scaffold stripping', () => {
	it('drops 2026-06-24 backfill instructional lines from prompt excerpts', () => {
		const body = [
			'# START HERE - Legacy',
			'',
			'## What this is',
			'> _authored - capture target_',
			'A real seeded description.',
			'',
			'## Non-goals',
			'> _authored - capture target_',
			'- Things we are deliberately not doing, with the reason in brief.',
			'',
			'## Current state',
			'> _authored - capture target_',
			'2-4 sentences: what just happened, what is in progress, and what is blocked.',
			'',
			'## Decisions',
			'- **Decision** - one-line rationale. _(YYYY-MM-DD)_',
			'',
			'## Vocabulary and mental model',
			'- **Term** - what it means in this project.',
			'',
			'## Open questions',
			'- Live question we have not resolved.'
		].join('\n');
		const excerpt = buildStartHerePromptExcerpt(body);
		expect(excerpt.content).toContain('A real seeded description.');
		expect(excerpt.content).not.toContain('deliberately not doing');
		expect(excerpt.content).not.toContain('2-4 sentences');
		expect(excerpt.content).not.toContain('one-line rationale');
		expect(excerpt.content).not.toContain('what it means in this project');
		expect(excerpt.content).not.toContain('Live question we have not resolved');
	});
});
