// packages/agentic-chat-runtime/src/context-finder/about-you.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AboutYouSection } from '@buildos/shared-agent-ops/ontology/about-you';
import {
	ABOUT_YOU_GATE_POLICY,
	aboutYouGateKey,
	buildAboutYouGateRequest,
	gateAboutYouSections,
	renderAboutYouBlock,
	renderAboutYouSettings
} from './about-you';
import type { ContextFinderDecider } from './rank';

const sections: AboutYouSection[] = [
	{
		heading: 'How you like answers',
		lines: [{ text: 'Outcome first, in product terms', noted: 'Oct 2026' }]
	},
	{
		heading: 'Schedule and constraints',
		lines: [
			{ text: 'Works late into the night', noted: 'Oct 2026' },
			{ text: 'New baby at home; keep plans realistic', noted: 'Oct 2026' }
		]
	},
	{ heading: 'Where you are', lines: [{ text: 'Glen Burnie, MD', noted: 'Oct 2026' }] }
];

const receipt = {
	modelRequested: 'jev',
	modelUsed: 'jev',
	requestId: 'r1',
	inputTokens: 1,
	outputTokens: 1,
	costUsd: 0.0009,
	durationMs: 300,
	requestBytes: 100,
	questionCount: 2,
	attempts: 1
};

function decider(answers: Record<string, unknown> | null): ContextFinderDecider {
	return {
		decide: vi.fn(async () =>
			answers
				? { ok: true as const, answers, receipt }
				: { ok: false as const, error: 'jev_timeout', receipt }
		)
	};
}

describe('buildAboutYouGateRequest', () => {
	it('asks one yes/no per section and carries the note in state', () => {
		const request = buildAboutYouGateRequest({
			sections: sections.slice(1),
			message: 'Find me a plumber this week',
			recentConversation: Array.from({ length: 6 }, (_, index) => ({
				role: 'user',
				content: `turn ${index}`
			}))
		});
		expect(Object.keys(request.questions)).toEqual([aboutYouGateKey(0), aboutYouGateKey(1)]);
		expect(request.state.about_you[1]).toEqual({
			ref: 'A1',
			heading: 'Where you are',
			lines: ['Glen Burnie, MD']
		});
		expect(request.state.recent_conversation).toHaveLength(4);
	});
});

describe('gateAboutYouSections', () => {
	it('never asks about the always-on answers section', async () => {
		const jev = decider({ a_A0: { noul: 0.9 }, a_A1: { noul: 0.2 } });
		const result = await gateAboutYouSections({
			decider: jev,
			sections,
			message: 'Plan my week'
		});
		const request = (jev.decide as ReturnType<typeof vi.fn>).mock.calls[0]![0];
		expect(request.state.about_you.map((s: { heading: string }) => s.heading)).toEqual([
			'Schedule and constraints',
			'Where you are'
		]);
		expect(result.status).toBe('ok');
		expect(result.selected.map((s) => s.heading)).toEqual(['Schedule and constraints']);
		expect(result.scores).toEqual([
			{ heading: 'Schedule and constraints', p: 0.9 },
			{ heading: 'Where you are', p: 0.2 }
		]);
		expect(result.costUsd).toBe(0.0009);
	});

	it('loads nothing below the threshold', async () => {
		const result = await gateAboutYouSections({
			decider: decider({
				a_A0: { noul: ABOUT_YOU_GATE_POLICY.threshold - 0.01 },
				a_A1: { noul: 0.1 }
			}),
			sections,
			message: 'Where am I at with things?'
		});
		expect(result.selected).toEqual([]);
	});

	it('fails open to nothing when Jev is unavailable', async () => {
		const result = await gateAboutYouSections({
			decider: decider(null),
			sections,
			message: 'Plan my week'
		});
		expect(result).toMatchObject({ status: 'unavailable', selected: [], error: 'jev_timeout' });
	});

	it('skips the call when only the answers section exists', async () => {
		const jev = decider({});
		const result = await gateAboutYouSections({
			decider: jev,
			sections: sections.slice(0, 1),
			message: 'hi'
		});
		expect(result.status).toBe('skipped');
		expect(jev.decide).not.toHaveBeenCalled();
	});
});

describe('renderAboutYouBlock', () => {
	it('is null when there is nothing to say', () => {
		expect(renderAboutYouBlock({ sections: [], gated: [], settings: null })).toBeNull();
	});

	it('always carries how they like answers and their own settings', () => {
		const block = renderAboutYouBlock({
			sections,
			gated: [],
			settings: { responseLength: 'concise', stakes: 'high', communicationStyle: 'bogus' }
		})!;
		expect(block).toContain(
			'How they like answers: Outcome first, in product terms; short, focused answers with just the essentials; their work here is for work or clients'
		);
		expect(block).toContain('Follow this without mentioning it.');
		expect(block).not.toContain('Background');
		expect(block).not.toContain('Glen Burnie');
	});

	it('adds only the gated sections, with the mention rule', () => {
		const block = renderAboutYouBlock({
			sections,
			gated: [sections[1]!],
			settings: null
		})!;
		expect(block).toContain(
			'- Schedule and constraints: Works late into the night; New baby at home; keep plans realistic.'
		);
		expect(block).toContain('Mention it only if it changes your recommendation');
		expect(block).not.toContain('Glen Burnie');
	});

	it('renders role and field from the Preferences tab', () => {
		expect(
			renderAboutYouSettings({ primaryRole: 'Founder', domainContext: 'B2B SaaS' })
		).toEqual(['their role: Founder', 'their field: B2B SaaS']);
	});
});
