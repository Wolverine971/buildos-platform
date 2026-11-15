// apps/web/src/lib/server/builder-profile/builder-share-card.test.ts
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { BuilderProfileView } from '$lib/builder-profile/types';
import {
	avatarHostAllowed,
	renderBuilderShareCard,
	SHARE_CARD_HEIGHT,
	SHARE_CARD_WIDTH,
	shareCardContent
} from './builder-share-card';

function view(overrides: Partial<BuilderProfileView> = {}): BuilderProfileView {
	return {
		found: true,
		status: 'published',
		viewer: {
			signed_in: false,
			is_owner: false,
			works_with: false,
			follows: false,
			ask_pending: false
		},
		profile: {
			handle: 'djwayne',
			name: 'DJ Wayne',
			headline: 'Founder, BuildOS',
			location: 'Glen Burnie, MD',
			now_text: 'Building project sharing and builder pages.'
		},
		settings: {
			show_build_log: true,
			show_agent_split: true,
			show_writing: false,
			show_builds_with: true
		},
		links: [],
		projects: [
			{ id: 'a', level: 'live', name: 'BuildOS', audience: 'anyone' },
			{ id: 'b', level: 'live', name: '9takes', audience: 'anyone' },
			{ id: 'c', level: 'listed', name: 'Client work', audience: 'collaborators' }
		],
		activity: {
			includes_private: false,
			show_agent_split: true,
			today: '2026-11-15',
			days: [
				['2026-11-14', 12, 4],
				['2026-11-02', 3, 0]
			]
		},
		writing: [],
		builds_with: [],
		...overrides
	};
}

describe('share card', () => {
	it('shows what anyone can see: name, headline, public projects, 6 months of days', () => {
		const content = shareCardContent(view());
		expect(content.name).toBe('DJ Wayne');
		expect(content.building).toEqual(['BuildOS', '9takes']);
		expect(content.log?.weeks).toHaveLength(26);
		expect(content.log).toMatchObject({ activeDays: 2, updates: 15, agentPercent: 27 });
		expect(content.initials).toBe('DW');
	});

	it('fetches photos only from our storage or Google sign-in', () => {
		const ours = 'https://abc.supabase.co';
		expect(avatarHostAllowed('https://abc.supabase.co/storage/v1/x.webp', ours)).toBe(true);
		expect(avatarHostAllowed('https://lh3.googleusercontent.com/a/x', ours)).toBe(true);
		expect(avatarHostAllowed('https://evil.example/x.png', ours)).toBe(false);
		expect(avatarHostAllowed('http://abc.supabase.co/x.png', ours)).toBe(false);
		expect(avatarHostAllowed('https://169.254.169.254/latest', ours)).toBe(false);
	});

	it('draws a 1200×630 PNG with no system fonts', async () => {
		const png = await renderBuilderShareCard(view());
		const meta = await sharp(png).metadata();
		expect(meta.format).toBe('png');
		expect([meta.width, meta.height]).toEqual([SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT]);
	}, 20_000);
});
