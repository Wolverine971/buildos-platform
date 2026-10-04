// apps/web/src/routes/.well-known/agent-skills/index.json/+server.ts
// Agent Skills discovery index (Cloudflare RFC v0.2.0 / agentskills spec PR #254). Lets
// `npx skills add https://build-os.com` find and install the public BuildOS skills.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildAgentSkillsDiscoveryIndex } from '$lib/server/agent-skills';

export const GET: RequestHandler = async () => {
	const index = await buildAgentSkillsDiscoveryIndex();

	return json(index, {
		headers: {
			'cache-control': 'public, max-age=300',
			'access-control-allow-origin': '*',
			'x-robots-tag': 'noindex'
		}
	});
};
