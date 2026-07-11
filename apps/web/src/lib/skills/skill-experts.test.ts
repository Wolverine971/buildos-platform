// apps/web/src/lib/skills/skill-experts.test.ts
import { describe, expect, it } from 'vitest';
import {
	getSkillExpertByName,
	getSkillExpertBySlug,
	getSkillExpertLineageRelationship,
	getSkillExpertPath,
	normalizeSkillExpertName,
	resolveSkillExperts,
	selectSkillExpertSourceHighlights,
	skillExperts
} from './skill-experts';

describe('skill expert profiles', () => {
	it('resolves Kane by normalized name and stable slug', () => {
		const byName = getSkillExpertByName('  KANE   KALLAWAY ');
		const bySlug = getSkillExpertBySlug('kane-kallaway');

		expect(normalizeSkillExpertName('Kane Kallaway')).toBe('kane kallaway');
		expect(byName).toBe(bySlug);
		expect(byName?.specialties).toContain('Short-form hooks');
		expect(getSkillExpertPath(byName!)).toBe('/skills/people/kane-kallaway');
	});

	it('keeps one relevant source per profiled person in a capped highlight list', () => {
		const kole = getSkillExpertBySlug('kole-jain')!;
		const lenny = getSkillExpertBySlug('lenny-rachitsky')!;
		const sources = [
			{ title: 'Kole one', creator: 'Kole Jain', channelName: 'Kole Jain' },
			{ title: 'Kole two', creator: 'Kole Jain', channelName: 'Kole Jain' },
			{ title: 'Design one', creator: 'DesignSpo', channelName: 'DesignSpo' },
			{ title: 'Design two', creator: 'DesignSpo', channelName: 'DesignSpo' },
			{ title: 'Design three', creator: 'DesignSpo', channelName: 'DesignSpo' },
			{
				title: 'Hosted interview',
				creator: 'Nesrine Changuel',
				channelName: "Lenny's Podcast"
			}
		];

		expect(
			selectSkillExpertSourceHighlights(sources, [kole, lenny], 5).map((s) => s.title)
		).toEqual(['Kole one', 'Hosted interview', 'Kole two', 'Design one', 'Design two']);
	});

	it('registers each frequent expert with a unique route and portrait metadata', () => {
		expect(skillExperts.map((expert) => expert.slug)).toEqual([
			'kane-kallaway',
			'lenny-rachitsky',
			'kole-jain',
			'april-dunford',
			'daniel-priestley',
			'nesrine-changuel',
			'tuan-le',
			'michael-seibel'
		]);
		expect(new Set(skillExperts.map((expert) => expert.slug)).size).toBe(skillExperts.length);
		for (const expert of skillExperts) {
			expect(expert.portrait.src).toMatch(/^\/images\/skill-people\/.+\.jpg$/);
			expect(expert.portrait.width).toBeGreaterThan(0);
			expect(expert.portrait.height).toBeGreaterThan(0);
			expect(expert.sources.length).toBeGreaterThanOrEqual(3);
		}
	});

	it('distinguishes a source creator from a podcast host', () => {
		const lenny = getSkillExpertBySlug('lenny-rachitsky')!;
		const kole = getSkillExpertBySlug('kole-jain')!;
		const april = getSkillExpertBySlug('april-dunford')!;
		const nesrine = getSkillExpertBySlug('nesrine-changuel')!;

		expect(
			getSkillExpertLineageRelationship(lenny, {
				creator: 'April Dunford',
				channelName: "Lenny's Podcast"
			})
		).toBe('channel');
		expect(
			getSkillExpertLineageRelationship(kole, {
				creator: 'Kole Jain',
				channelName: 'Kole Jain'
			})
		).toBe('creator');
		expect(
			getSkillExpertLineageRelationship(lenny, {
				creator: 'April Dunford',
				channelName: 'Another Podcast'
			})
		).toBeUndefined();
		expect(
			getSkillExpertLineageRelationship(april, {
				creator: 'April Dunford',
				channelName: "Lenny's Podcast"
			})
		).toBe('creator');
		expect(
			getSkillExpertLineageRelationship(nesrine, {
				creator: 'Nesrine Changuel',
				channelName: "Lenny's Podcast"
			})
		).toBe('creator');
	});

	it('preserves unprofiled lineage people as a graceful fallback', () => {
		expect(resolveSkillExperts(['Kane Kallaway', 'Future Expert'])).toEqual([
			expect.objectContaining({
				name: 'Kane Kallaway',
				profile: expect.objectContaining({ slug: 'kane-kallaway' })
			}),
			{ name: 'Future Expert', profile: undefined }
		]);
	});
});
