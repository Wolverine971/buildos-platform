// apps/web/src/routes/agent-skills/[slug]/bundle.zip/+server.ts
import type { RequestHandler } from './$types';
import { buildAgentSkillBundleZip, getAgentSkillDownloadHeaders } from '$lib/server/agent-skills';
import { AGENT_SKILLS_CATEGORY_KEY, loadBlogPostMetadata } from '$lib/utils/blog';

export const GET: RequestHandler = async ({ params }) => {
	const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, params.slug);
	// Files sit under `<skill name>/` so the zip unzips straight into a skills folder.
	const archive = buildAgentSkillBundleZip(post, 'directory');

	return new Response(archive.bytes, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${archive.name}.zip"`,
			'cache-control': 'public, max-age=300',
			...getAgentSkillDownloadHeaders(post.slug)
		}
	});
};
