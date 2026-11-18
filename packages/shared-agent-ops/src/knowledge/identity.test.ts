// packages/shared-agent-ops/src/knowledge/identity.test.ts
// Circles, anchors helpers and the "same one?" check (tasker 164, part A). The decision model is
// a fake that records what it was asked; nothing here calls a network.
import { describe, expect, it } from 'vitest';
import {
	domainMatchesName,
	findLinks,
	mentionWindow,
	redactContactDetails,
	type KnowledgeAnchors
} from './anchors';
import { circleFromSignals, decideCirclesWithModel, type CircleSignals } from './circles';
import {
	checkIdentity,
	checkIdentityBatch,
	identityByRules,
	identityQuestion,
	type IdentityDecider
} from './identity';

function anchors(over: Partial<KnowledgeAnchors> = {}): KnowledgeAnchors {
	return {
		entityId: 'e1',
		name: 'Cody Shooting Complex',
		kind: 'org',
		circle: 'inner',
		knownByMe: false,
		domains: [],
		urls: [],
		facts: [],
		employer: null,
		employerDomain: null,
		people: [],
		places: [],
		mentions: [],
		not: [],
		...over
	};
}

type Asked = { state: any; questions: Record<string, any> };

/** Answers each question with the option named in `picks` (by question-name suffix or exact). */
function fakeDecider(picks: Record<string, string>, cost = 0.0005) {
	const asked: Asked[] = [];
	const decider: IdentityDecider = {
		async decide(request) {
			asked.push(request as Asked);
			const answers: Record<string, unknown> = {};
			for (const [name, q] of Object.entries(request.questions)) {
				const pick =
					picks[name] ?? picks[name.replace(/^c\d+_/, '')] ?? Object.keys(q.criteria)[0]!;
				const probabilities = Object.fromEntries(
					Object.keys(q.criteria).map((o) => [
						o,
						o === pick ? 0.9 : 0.1 / (Object.keys(q.criteria).length - 1)
					])
				);
				answers[name] = { type: 'choice', choice: pick, probabilities, confidence: 0.9 };
			}
			return { ok: true, answers, receipt: { costUsd: cost } };
		}
	};
	return { decider, asked };
}

describe('anchor helpers', () => {
	it("recognises an entry's own domain by its name, not someone else's", () => {
		expect(domainMatchesName('codyshootingcomplex.org', 'Cody Shooting Complex')).toBe(true);
		expect(domainMatchesName('www.laindustrial.com', 'LA Industrial Services LLC')).toBe(true);
		expect(domainMatchesName('nrlhunter.com', 'NRL Hunter')).toBe(true);
		expect(domainMatchesName('iowadnr.gov', 'Cody Shooting Complex')).toBe(false);
		expect(domainMatchesName('linkedin.com', 'LA Industrial')).toBe(false);
		expect(domainMatchesName('go.com', 'Go')).toBe(false);
		expect(
			domainMatchesName('codyshootingcomplex.ezfacility.com', 'Cody Shooting Complex')
		).toBe(false);
		expect(domainMatchesName('portal.ezfacility.com', 'EZFacility')).toBe(true);
	});

	it('blanks emails and phone numbers but keeps years and short numbers', () => {
		expect(
			redactContactDetails(
				'Call Louis at (410) 555-0199 or louis@la-ind.com before 2026, unit 12'
			)
		).toBe('Call Louis at [phone] or [email] before 2026, unit 12');
	});

	it('finds bare domains and URLs, and marks domains taken from email addresses', () => {
		const links = findLinks(
			'Update codyshootingcomplex.org/events; email info@cody-range.com. See https://x.example/a.'
		);
		expect(links.map((l) => [l.domain, l.fromEmail])).toEqual(
			expect.arrayContaining([
				['codyshootingcomplex.org', false],
				['x.example', false],
				['cody-range.com', true]
			])
		);
		expect(links.some((l) => l.domain === 'cody-range.com' && !l.fromEmail)).toBe(false);
	});

	it('takes literal windows around the name', () => {
		const text = `${'x '.repeat(200)}Meet Louis Arnette at LA Industrial Services about the quote. ${'y '.repeat(200)}`;
		const window = mentionWindow(text, 'LA Industrial', 120);
		expect(window).toContain('LA Industrial Services');
		expect(window.length).toBeLessThan(140);
	});
});

describe('circles from structured signals', () => {
	const base: CircleSignals = {
		entityId: 'e1',
		name: 'Louis Arnette',
		kind: 'person',
		isSelf: false,
		createdVia: 'backfill',
		knownByMe: false,
		ownedByMe: false,
		hasPrivateContact: false,
		worksForMine: false,
		linkedRecords: 2,
		mentions: ['Send Louis Arnette the quote'],
		current: { circle: 'unknown', source: null }
	};

	it('settles the clear cases without the model', () => {
		expect(circleFromSignals({ ...base, knownByMe: true })).toMatchObject({
			circle: 'inner',
			reason: 'knows'
		});
		expect(circleFromSignals({ ...base, createdVia: 'import' })).toMatchObject({
			circle: 'inner',
			reason: 'imported'
		});
		expect(circleFromSignals({ ...base, hasPrivateContact: true })).toMatchObject({
			circle: 'inner',
			reason: 'private_contact'
		});
		expect(
			circleFromSignals({ ...base, createdVia: 'enrichment', linkedRecords: 0, mentions: [] })
		).toMatchObject({ circle: 'public', reason: 'found_by_research' });
	});

	it("leaves a name that is only mentioned in the user's work to the model", () => {
		expect(circleFromSignals(base)).toBeNull();
	});

	it("keeps the user's own answer and an earlier model decision", () => {
		expect(
			circleFromSignals({
				...base,
				current: { circle: 'public', source: 'user' },
				knownByMe: true
			})
		).toMatchObject({
			circle: 'public',
			source: 'user'
		});
		expect(
			circleFromSignals({ ...base, current: { circle: 'public', source: 'model' } })
		).toMatchObject({
			circle: 'public',
			source: 'model'
		});
	});

	it('asks the model once for many entries and stores unsure picks as unknown', async () => {
		const { decider, asked } = fakeDecider({ e1: 'inner', e2: 'public' });
		const result = await decideCirclesWithModel(
			[
				{ ...base, entityId: 'a', mentions: ['Call Louis Arnette, 410-555-0199'] },
				{
					...base,
					entityId: 'b',
					name: 'Tim Ferriss',
					mentions: ['Listen to Tim Ferriss episode']
				}
			],
			decider
		);
		expect(asked).toHaveLength(1);
		expect(result.decisions.map((d) => [d.entityId, d.circle, d.source])).toEqual([
			['a', 'inner', 'model'],
			['b', 'public', 'model']
		]);
		expect(JSON.stringify(asked[0]!.state)).not.toContain('555-0199');
		const none = await decideCirclesWithModel([{ ...base, entityId: 'c' }], null);
		expect(none.decisions[0]).toMatchObject({ circle: 'unknown', reason: 'model_unsure' });
	});
});

describe('identity check: pages', () => {
	const cody = anchors({
		domains: ['codyshootingcomplex.org'],
		places: ['Cody, WY'],
		not: [
			{
				label: 'not the Cody Shooting Complex in Long Grove, IA',
				domains: [],
				urls: ['https://www.iowadnr.gov/places-to-go/shooting-sports/cody']
			}
		]
	});

	it('decides own-site and rejected pages by rules, free', () => {
		expect(
			identityByRules(
				{ anchors: cody },
				{ type: 'page', url: 'https://www.codyshootingcomplex.org/about', text: 'x' }
			)
		).toMatchObject({
			verdict: 'same',
			reason: 'own_site'
		});
		expect(
			identityByRules(
				{ anchors: cody },
				{
					type: 'page',
					url: 'https://www.iowadnr.gov/places-to-go/shooting-sports/cody',
					text: 'x'
				}
			)
		).toMatchObject({ verdict: 'different', reason: 'not_this_one' });
		// A knowledge panel describing another site is judged by that site.
		expect(
			identityByRules(
				{ anchors: cody },
				{
					type: 'page',
					url: 'https://www.google.com/search?q=x',
					site: 'https://codyshootingcomplex.org',
					text: 'x'
				}
			)
		).toMatchObject({ verdict: 'same' });
		expect(
			identityByRules(
				{ anchors: anchors() },
				{ type: 'page', url: 'https://a.example', text: 'x' }
			)
		).toMatchObject({
			verdict: 'ask',
			reason: 'no_anchors'
		});
		expect(
			identityByRules(
				{ anchors: cody },
				{ type: 'page', url: 'https://news.example/cody', text: 'x' }
			)
		).toBeNull();
	});

	it('sends the rest to the model in one call and maps its choices', async () => {
		const { decider, asked } = fakeDecider({
			c1_match: 'different',
			c2_match: 'same',
			c3_match: 'unclear'
		});
		const pages = [
			'https://iowa.example/range',
			'https://cody-news.example/range',
			'https://dir.example/ranges'
		].map((url) => ({
			type: 'page' as const,
			url,
			text: 'The Cody Shooting Complex in Long Grove offers trap and skeet. Call 563-555-0100.'
		}));
		const own = { type: 'page' as const, url: 'https://codyshootingcomplex.org', text: 'x' };
		const result = await checkIdentityBatch({ anchors: cody }, [...pages, own], { decider });
		expect(asked).toHaveLength(1);
		expect(Object.keys(asked[0]!.questions)).toEqual(['c1_match', 'c2_match', 'c3_match']);
		expect(result.results.map((r) => r.verdict)).toEqual(['different', 'same', 'ask', 'same']);
		expect(result.results[3]!.decidedBy).toBe('rules');
		expect(result.costUsd).toBe(0.0005);
		expect(JSON.stringify(asked[0]!.state)).not.toContain('555-0100');
		expect(JSON.stringify(asked[0]!.state)).toContain('Long Grove, IA');
	});

	it('fails closed for pages when the model is missing or fails', async () => {
		const page = { type: 'page' as const, url: 'https://news.example/x', text: 'x' };
		expect((await checkIdentity({ anchors: cody }, page)).verdict).toBe('ask');
		const failing: IdentityDecider = {
			decide: async () => ({ ok: false, error: 'jev_timeout', receipt: { costUsd: null } })
		};
		expect(await checkIdentity({ anchors: cody }, page, { decider: failing })).toMatchObject({
			verdict: 'ask',
			reason: 'model_unavailable',
			decidedBy: 'fallback'
		});
	});
});

describe('identity check: claims about people you know', () => {
	const jev = anchors({
		name: 'Jev',
		kind: 'person',
		circle: 'inner',
		knownByMe: true,
		mentions: [{ record_kind: 'task', title: null, text: 'Lunch with Jev' }]
	});

	it('never questions personal details', async () => {
		const { decider, asked } = fakeDecider({});
		const result = await checkIdentity(
			{ anchors: jev },
			{ type: 'claim', via: 'chat', predicate: 'phone', value: '+14105550199' },
			{ decider }
		);
		expect(result).toMatchObject({ verdict: 'same', reason: 'personal_detail' });
		expect(asked).toHaveLength(0);
	});

	it('lets a casual claim through and asks about a public-sounding one', async () => {
		const casual = fakeDecider({ match: 'same', prominence: 'ordinary' });
		expect(
			await checkIdentity(
				{ anchors: jev, relation: 'your friend' },
				{ type: 'claim', via: 'chat', text: 'Jev works at a bakery in Annapolis' },
				casual
			)
		).toMatchObject({ verdict: 'same' });

		const famous = fakeDecider({ match: 'unclear', prominence: 'prominent' });
		const result = await checkIdentity(
			{ anchors: jev, relation: 'your friend' },
			{
				type: 'claim',
				via: 'chat',
				text: 'Jev is in leadership at Amazon',
				name: 'Jeff Bezos'
			},
			famous
		);
		expect(result).toMatchObject({ verdict: 'ask', reason: 'prominent_claim' });
		expect(result.question).toBe('Is Jev, your friend, the same person as Jeff Bezos?');
		expect(Object.keys(famous.asked[0]!.questions)).toEqual(['c1_match', 'c1_prominence']);
	});

	it('does not ask how famous a claim is for someone outside the inner circle', async () => {
		const { decider, asked } = fakeDecider({ match: 'same' });
		await checkIdentity(
			{ anchors: anchors({ name: 'Pat Lee', kind: 'person', circle: 'unknown' }) },
			{ type: 'claim', via: 'chat', text: 'Pat Lee runs a podcast' },
			{ decider }
		);
		expect(Object.keys(asked[0]!.questions)).toEqual(['c1_match']);
	});

	it('phrases the question from structured parts', () => {
		expect(
			identityQuestion(
				{ anchors: jev },
				{ type: 'claim', via: 'chat', predicate: 'headline', value: 'SVP at Amazon' }
			)
		).toBe(
			'Is Jev, someone you know, the same person as the Jev with headline "SVP at Amazon"?'
		);
		expect(
			identityQuestion(
				{ anchors: anchors({ circle: 'unknown' }) },
				{ type: 'claim', via: 'chat', text: 'They run a range in Iowa' }
			)
		).toBe(
			'Is Cody Shooting Complex the same organization as the Cody Shooting Complex in "They run a range in Iowa"?'
		);
	});
});

describe('links from notes', () => {
	it('strips markdown, query strings and app links', async () => {
		const { contextLink } = await import('./anchors');
		expect(findLinks('Site: **laindustrialservices.com**').map((l) => l.domain)).toEqual([
			'laindustrialservices.com'
		]);
		expect(contextLink('https://mail.google.com/mail/u?authuser=dj%40example.com')).toBe(
			'https://mail.google.com/mail/u'
		);
		expect(contextLink('https://google.com/maps/dir?api=1&destination=820+Main+St')).toBe(
			'https://google.com/maps/dir'
		);
		expect(contextLink('https://build-os.com/projects/abc?view=work')).toBeNull();
	});
});
