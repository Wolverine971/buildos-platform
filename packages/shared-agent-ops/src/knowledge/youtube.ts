// packages/shared-agent-ops/src/knowledge/youtube.ts
//
// YouTube's free oEmbed endpoint gives a video's title, channel and thumbnail without an API
// key. Used when videos are pasted in (web) and when a video is researched (worker).

import { youtubeChannelKey, youtubeVideoId } from './normalize';
import type { KnowledgeWriteBatch } from './types';

export interface YouTubeOEmbed {
	title?: string;
	author_name?: string;
	author_url?: string;
	thumbnail_url?: string;
}

export async function fetchYouTubeOEmbed(
	url: string,
	fetchFn: typeof fetch = fetch,
	signal?: AbortSignal
): Promise<YouTubeOEmbed | null> {
	const id = youtubeVideoId(url);
	if (!id) return null; // oEmbed answers for videos only
	try {
		const response = await fetchFn(
			`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
			{ signal: signal ?? AbortSignal.timeout(10_000) }
		);
		if (!response.ok) return null;
		return (await response.json()) as YouTubeOEmbed;
	} catch {
		return null;
	}
}

/** Facts YouTube itself states about an existing video entry: channel and thumbnail. */
export function oembedBatch(
	entityId: string,
	kind: string,
	url: string,
	oembed: YouTubeOEmbed
): KnowledgeWriteBatch {
	const batch: KnowledgeWriteBatch = {
		entities: [],
		facts: [],
		sources: [{ ref: 'yt', type: 'youtube', url, title: oembed.title ?? 'YouTube' }]
	};
	if (kind !== 'video') return batch;
	if (oembed.thumbnail_url) {
		batch.facts.push({
			subject: entityId,
			predicate: 'thumbnail_url',
			value: oembed.thumbnail_url,
			sources: ['yt']
		});
	}
	if (oembed.author_name && oembed.author_url && youtubeChannelKey(oembed.author_url)) {
		batch.entities.push({
			ref: 'channel',
			kind: 'channel',
			name: oembed.author_name,
			keys: [{ type: 'youtube_channel', value: oembed.author_url }]
		});
		batch.facts.push({
			subject: entityId,
			predicate: 'published_by',
			object: 'channel',
			sources: ['yt']
		});
		batch.facts.push({
			subject: 'channel',
			predicate: 'url',
			value: oembed.author_url,
			sources: ['yt']
		});
	}
	return batch;
}

/**
 * New video entries from pasted links, each tied to its channel. With `own`, the user owns the
 * videos and their channels ("my videos").
 */
export function planYouTubeVideos(
	items: Array<{ url: string; oembed: YouTubeOEmbed | null }>,
	options: { own: boolean }
): KnowledgeWriteBatch {
	const batch: KnowledgeWriteBatch = { entities: [], facts: [], sources: [] };
	if (options.own) batch.entities.push({ ref: 'self', self: true, kind: 'person', name: 'Me' });
	const channels = new Map<string, string>();
	items.forEach(({ url, oembed }, i) => {
		const id = youtubeVideoId(url);
		if (!id) return;
		const canonical = `https://www.youtube.com/watch?v=${id}`;
		const ref = `v${i}`;
		const source = `s${i}`;
		batch.sources!.push({
			ref: source,
			type: 'youtube',
			url: canonical,
			title: oembed?.title ?? 'YouTube'
		});
		batch.entities.push({
			ref,
			kind: 'video',
			name: oembed?.title?.slice(0, 300) || `YouTube video ${id}`,
			...(oembed?.author_name ? { summary: `Video by ${oembed.author_name}` } : {}),
			keys: [{ type: 'youtube_video', value: id }]
		});
		batch.facts.push({ subject: ref, predicate: 'url', value: canonical, sources: [source] });
		if (oembed?.thumbnail_url) {
			batch.facts.push({
				subject: ref,
				predicate: 'thumbnail_url',
				value: oembed.thumbnail_url,
				sources: [source]
			});
		}
		if (options.own) batch.facts.push({ subject: 'self', predicate: 'owns', object: ref });
		const channelKey = oembed?.author_url ? youtubeChannelKey(oembed.author_url) : null;
		if (oembed?.author_name && oembed.author_url && channelKey) {
			let channelRef = channels.get(channelKey);
			if (!channelRef) {
				channelRef = `c${channels.size}`;
				channels.set(channelKey, channelRef);
				batch.entities.push({
					ref: channelRef,
					kind: 'channel',
					name: oembed.author_name.slice(0, 300),
					summary: 'YouTube channel',
					keys: [{ type: 'youtube_channel', value: oembed.author_url }]
				});
				batch.facts.push({
					subject: channelRef,
					predicate: 'url',
					value: oembed.author_url,
					sources: [source]
				});
				if (options.own)
					batch.facts.push({ subject: 'self', predicate: 'owns', object: channelRef });
			}
			batch.facts.push({
				subject: ref,
				predicate: 'published_by',
				object: channelRef,
				sources: [source]
			});
		}
	});
	return batch;
}
