import { error } from '@sveltejs/kit';
import { strToU8, zipSync } from 'fflate';
import type { RequestHandler } from './$types';
import { buildPortableAgentSkillBundle } from '$lib/server/agent-skills';
import { AGENT_SKILLS_CATEGORY_KEY, loadBlogPostMetadata } from '$lib/utils/blog';

export const GET: RequestHandler = async ({ params }) => {
	const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, params.slug);
	const bundle = buildPortableAgentSkillBundle(post);
	const files: Record<string, Uint8Array> = {};

	for (const [path, content] of Object.entries(bundle.files)) {
		files[`${bundle.directory}/${path}`] = strToU8(content);
	}

	const bytes = zipSync(files, { level: 6 });
	const buffer = new Uint8Array(bytes);

	return new Response(buffer, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${bundle.directory}.zip"`,
			'cache-control': 'public, max-age=300'
		}
	});
};
