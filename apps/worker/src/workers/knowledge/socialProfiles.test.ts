// apps/worker/src/workers/knowledge/socialProfiles.test.ts
//
// A social account is only the entry's own when a page that is theirs points at it, or the
// account itself was checked. These tests pin what counts as an account address, what a page's
// links say, and which of several accounts on a site belongs to its owner.
import { describe, expect, it } from 'vitest';
import {
	findSocialProfiles,
	harvestSocialLinks,
	harvestSocialLinksFromText,
	ownAccounts,
	parseSocialProfile,
	platformStatus,
	profileFitsKind
} from './socialProfiles';

describe('parseSocialProfile', () => {
	it('reads account addresses into one standard form', () => {
		expect(parseSocialProfile('https://www.instagram.com/@thecadre.training')).toMatchObject({
			platform: 'instagram',
			handle: 'thecadre.training',
			url: 'https://www.instagram.com/thecadre.training'
		});
		expect(parseSocialProfile('instagram.com/griffinpdavis/…')?.url).toBe(
			'https://www.instagram.com/griffinpdavis'
		);
		expect(parseSocialProfile('https://twitter.com/GriffinPDavis?lang=en')?.url).toBe(
			'https://x.com/griffinpdavis'
		);
		expect(parseSocialProfile('https://uk.linkedin.com/in/griffin-davis-67732976/')).toMatchObject({
			platform: 'linkedin',
			owner: 'person',
			url: 'https://www.linkedin.com/in/griffin-davis-67732976'
		});
		expect(parseSocialProfile('https://www.linkedin.com/company/the-cadre/about/')).toMatchObject({
			owner: 'org',
			url: 'https://www.linkedin.com/company/the-cadre'
		});
		expect(parseSocialProfile('https://www.youtube.com/@TheCadre.Training')?.url).toBe(
			'https://www.youtube.com/@thecadre.training'
		);
		expect(parseSocialProfile('https://fb.com/thecadre')?.platform).toBe('facebook');
	});

	it('refuses posts, share buttons, platform pages and other sites', () => {
		for (const url of [
			'https://www.instagram.com/p/C8abc123/',
			'https://www.instagram.com/reel/C8abc123/',
			'https://twitter.com/intent/tweet?text=hi',
			'https://x.com/griffinpdavis/status/123456',
			'https://www.facebook.com/sharer/sharer.php?u=https://example.com',
			'https://www.linkedin.com/shareArticle?mini=true',
			'https://www.linkedin.com/pub/dir/Griffin/Davis',
			'https://www.youtube.com/watch?v=abc',
			'https://github.com/someone/some-repo',
			'https://www.instagram.com/',
			'https://www.instagram.com/squarespace',
			'https://example.com/team/griffin',
			'not a url at all'
		])
			expect(parseSocialProfile(url), url).toBeNull();
	});

	it('knows a personal LinkedIn from a company page', () => {
		const person = parseSocialProfile('https://linkedin.com/in/someone')!;
		const company = parseSocialProfile('https://linkedin.com/company/acme')!;
		expect(profileFitsKind(person, 'person')).toBe(true);
		expect(profileFitsKind(person, 'org')).toBe(false);
		expect(profileFitsKind(company, 'person')).toBe(false);
		expect(profileFitsKind(parseSocialProfile('https://instagram.com/acme')!, 'org')).toBe(true);
	});
});

describe('harvestSocialLinks', () => {
	it('reads declared accounts, footer links and rel="me", and skips share buttons', () => {
		const html = `
			<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"The Cadre","sameAs":["https://www.instagram.com/thecadre.training/","https://www.youtube.com/@TheCadre.Training"]}]}</script>
			<a href="https://twitter.com/intent/tweet?url=x">Share</a>
			<footer>
				<a href='https://www.facebook.com/thecadretraining'><svg></svg></a>
				<a rel="noopener me" href="https://x.com/thecadre">X</a>
				<a href="https://www.instagram.com/thecadre.training/">IG</a>
				<a href="/classes">Classes</a>
			</footer>`;
		const found = harvestSocialLinks(html);
		const by = Object.fromEntries(found.map((p) => [p.platform, p]));
		expect(Object.keys(by).sort()).toEqual(['facebook', 'instagram', 'x', 'youtube']);
		expect(by.instagram).toMatchObject({ via: 'declared', handle: 'thecadre.training' });
		expect(by.x!.via).toBe('declared');
		expect(by.facebook!.via).toBe('linked');
	});

	it('finds an address written in a bio', () => {
		const found = harvestSocialLinksFromText(
			'ep at breaking points. sketches at choom room. Los Angeles, CA instagram.com/griffinpdavis/… Joined 2011'
		);
		expect(found.map((p) => p.url)).toEqual(['https://www.instagram.com/griffinpdavis']);
	});
});

describe('ownAccounts', () => {
	const link = (url: string, via: 'declared' | 'linked' = 'linked') => ({
		...parseSocialProfile(url)!,
		via,
		found: url
	});

	it("takes the footer account over a team member's, and refuses a tie", () => {
		const footer = link('https://instagram.com/thecadre.training');
		const teamPage = [footer, link('https://instagram.com/phil.personal'), link('https://instagram.com/corey.personal')];
		const own = ownAccounts([[footer], teamPage, [footer]]);
		expect(own.map((p) => p.handle)).toEqual(['thecadre.training']);

		// One page, two accounts on one platform, nothing to tell them apart.
		expect(ownAccounts([[link('https://x.com/one'), link('https://x.com/two')]])).toEqual([]);
		// A declared account wins even when another is linked more often.
		const declared = link('https://x.com/official', 'declared');
		expect(
			ownAccounts([[declared, link('https://x.com/other')], [link('https://x.com/other')]]).map((p) => p.handle)
		).toEqual(['official']);
	});
});

describe('platformStatus', () => {
	it('says which platforms an entry has and which are still worth finding', () => {
		const status = platformStatus('person', [
			'https://x.com/griffinpdavis',
			'https://en.wikipedia.org/wiki/Someone'
		]);
		expect(status.have.map((p) => p.platform)).toEqual(['x']);
		expect(status.want).toEqual(['linkedin', 'instagram']);
		expect(platformStatus('org', []).want[0]).toBe('linkedin');
	});
});

describe('findSocialProfiles: whose account is it', () => {
	const page = (over: Partial<Parameters<typeof findSocialProfiles>[0]['pages'][number]>) => ({
		url: 'https://example.com/',
		title: null,
		text: '',
		verdict: 'same' as const,
		ownSite: false,
		...over
	});

	it("takes a company's accounts from its own website's footer, never from someone else's page", () => {
		const footer = '<footer><a href="https://www.instagram.com/thecadre.training/"></a><a href="https://www.linkedin.com/company/the-cadre"></a></footer>';
		const { findings } = findSocialProfiles({
			kind: 'org',
			known: [],
			pages: [
				page({ url: 'https://thecadretraining.com/', ownSite: true, html: footer }),
				// A directory page about them that links some other shop's Instagram.
				page({
					url: 'https://directory.example/the-cadre',
					html: '<a href="https://instagram.com/otherrange"></a>',
					text: 'instagram.com/otherrange'
				})
			]
		});
		expect(findings.map((f) => [f.profile.platform, f.profile.handle, f.ground, f.confirmed])).toEqual([
			['instagram', 'thecadre.training', 'linked', true],
			['linkedin', 'the-cadre', 'linked', true]
		]);
	});

	it('takes a confirmed profile and the one account its bio links, and never a name match', () => {
		const { findings, nameOnly } = findSocialProfiles({
			kind: 'person',
			known: [],
			pages: [
				page({
					url: 'https://x.com/griffinpdavis',
					title: 'Griffin Davis (@griffinpdavis) / X',
					text: 'Griffin Davis @griffinpdavis ep at breaking points. Los Angeles, CA instagram.com/griffinpdavis/… Joined 2011'
				}),
				// Three other Griffin Davises: the check could not confirm any of them.
				page({ url: 'https://www.instagram.com/griffindavis', verdict: 'ask' }),
				page({ url: 'https://www.instagram.com/griffin.davis.art', verdict: 'ask' }),
				// A company page can never be a person's account.
				page({ url: 'https://www.linkedin.com/company/breaking-points' })
			]
		});
		expect(findings.map((f) => [f.profile.url, f.ground])).toEqual([
			['https://x.com/griffinpdavis', 'is_profile'],
			['https://www.instagram.com/griffinpdavis', 'linked']
		]);
		expect(nameOnly).toEqual([
			'https://www.instagram.com/griffindavis',
			'https://www.instagram.com/griffin.davis.art'
		]);
	});

	it('offers an unconfirmed account with the same name as a confirmed one only as something to check', () => {
		const { findings, nameOnly } = findSocialProfiles({
			kind: 'person',
			known: ['https://x.com/emilyjashinsky'],
			pages: [
				page({ url: 'https://www.instagram.com/emily_jashinsky', verdict: 'ask' }),
				page({ url: 'https://www.instagram.com/emilyj', verdict: 'ask' })
			]
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({ ground: 'same_handle', confirmed: false });
		expect(findings[0]!.evidence).toContain('Same account name as their X');
		expect(nameOnly).toEqual(['https://www.instagram.com/emilyj']);
	});
});

