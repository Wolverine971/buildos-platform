// packages/shared-agent-ops/src/knowledge/youtube.test.ts
import { describe, expect, it } from 'vitest';
import { fetchYouTubeOEmbed, planYouTubeVideos } from './youtube';

describe('YouTube videos', () => {
	it('links pasted videos to one channel and to the user when they are theirs', () => {
		const oembed = {
			title: 'How I plan a week',
			author_name: 'DJ Wayne',
			author_url: 'https://www.youtube.com/@djwayne',
			thumbnail_url: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg'
		};
		const batch = planYouTubeVideos(
			[
				{ url: 'https://youtu.be/AAAAAAAAAAA', oembed },
				{
					url: 'https://www.youtube.com/watch?v=BBBBBBBBBBB',
					oembed: { ...oembed, title: 'Second' }
				},
				{ url: 'https://example.com/not-youtube', oembed: null }
			],
			{ own: true }
		);
		expect(batch.entities.map((e) => `${e.kind}:${e.name}`)).toEqual([
			'person:Me',
			'video:How I plan a week',
			'channel:DJ Wayne',
			'video:Second'
		]);
		expect(
			batch.facts.filter((f) => f.predicate === 'published_by').map((f) => f.object)
		).toEqual(['c0', 'c0']);
		expect(batch.facts.filter((f) => f.predicate === 'owns').map((f) => f.object)).toEqual([
			'v0',
			'c0',
			'v1'
		]);
		expect(batch.entities[1]!.keys).toEqual([{ type: 'youtube_video', value: 'AAAAAAAAAAA' }]);
	});

	it('falls back to the video id when YouTube has no metadata, and asks oEmbed only for videos', async () => {
		const batch = planYouTubeVideos([{ url: 'https://youtu.be/CCCCCCCCCCC', oembed: null }], {
			own: false
		});
		expect(batch.entities).toEqual([
			{
				ref: 'v0',
				kind: 'video',
				name: 'YouTube video CCCCCCCCCCC',
				keys: [{ type: 'youtube_video', value: 'CCCCCCCCCCC' }]
			}
		]);
		let calls = 0;
		const fakeFetch = (async () => {
			calls++;
			return new Response(JSON.stringify({ title: 'x' }), { status: 200 });
		}) as typeof fetch;
		expect(await fetchYouTubeOEmbed('https://www.youtube.com/@channel', fakeFetch)).toBeNull();
		expect(await fetchYouTubeOEmbed('https://youtu.be/CCCCCCCCCCC', fakeFetch)).toEqual({
			title: 'x'
		});
		expect(calls).toBe(1);
	});
});
