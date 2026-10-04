// apps/web/src/routes/.well-known/agent-skills/[archive]/+server.ts
// Serves `/.well-known/agent-skills/<name>.zip` with SKILL.md at the archive root, byte-identical
// to the digest published in the discovery index.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	buildAgentSkillBundleZip,
	findAgentSkillPostByPortableName,
	getAgentSkillDownloadHeaders
} from '$lib/server/agent-skills';

export const GET: RequestHandler = async ({ params }) => {
	const name = params.archive.endsWith('.zip') ? params.archive.slice(0, -'.zip'.length) : '';
	const post = name ? await findAgentSkillPostByPortableName(name) : undefined;

	if (!post) {
		throw error(404, 'Skill archive not found');
	}

	const archive = buildAgentSkillBundleZip(post, 'root');

	return new Response(archive.bytes, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${archive.name}.zip"`,
			'cache-control': 'public, max-age=300',
			'access-control-allow-origin': '*',
			...getAgentSkillDownloadHeaders(post.slug)
		}
	});
};
