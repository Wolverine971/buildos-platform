// apps/web/src/lib/server/projects/project-emoji.ts
//
// The emojis a project shows in place of initials (onto_projects.icon_emoji: picked automatically or
// chosen by the owner; docs/specs/PROJECT_EMOJI_PLAN_2026-10-01.md), for the Projects page.
// Read with the viewer's client, so RLS decides what they can see. A project without a pick
// keeps its initials. (The project page gets its emoji from the skeleton RPC instead.)
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { tileGlyphs } from '$lib/components/project/emoji/project-emoji';

type Client = SupabaseClient<Database>;

/** Keeps `id=in.(…)` well inside URL limits. */
const IDS_PER_REQUEST = 120;

type Row = { id: string; glyphs: unknown };

export async function loadProjectEmojis(
	client: Client,
	projectIds: readonly string[]
): Promise<Map<string, string[]>> {
	const emojis = new Map<string, string[]>();
	const reads = [];
	for (let start = 0; start < projectIds.length; start += IDS_PER_REQUEST) {
		reads.push(
			client
				.from('onto_projects')
				.select('id, glyphs:icon_emoji->glyphs')
				.in('id', projectIds.slice(start, start + IDS_PER_REQUEST))
				.not('icon_emoji', 'is', null)
		);
	}
	for (const { data, error } of await Promise.all(reads)) {
		if (error) throw new Error(`project emojis: ${error.message}`);
		for (const row of (data ?? []) as unknown as Row[]) {
			const glyphs = tileGlyphs(row.glyphs);
			if (glyphs) emojis.set(row.id, glyphs);
		}
	}
	return emojis;
}
