// apps/web/src/lib/components/layout/agent-chat-launch-params.ts
import { normalizeLaunchSkillId } from '$lib/utils/agent-chat-launch';

/**
 * Query params of a chat launch (`/?open=agent-chat&skill=<id>&prompt=<draft>`, the
 * public "Try in BuildOS" link). Navigation consumes them once and strips them all.
 */
export const AGENT_CHAT_LAUNCH_PARAMS = ['open', 'skill', 'prompt'] as const;

const MAX_LAUNCH_DRAFT_CHARS = 2400;

export type AgentChatLaunchRequest = {
	/** Text placed in the composer for the user to send. */
	draft: string;
	/** Structured runtime skill id, sent with the launch's first turn; null when absent or malformed. */
	skillId: string | null;
	/** Identity of this launch, so a replayed URL never opens a second chat. */
	key: string;
};

/** The launch a URL asks for, or null when it asks for none (nothing to put in the composer). */
export function readAgentChatLaunchRequest(url: URL): AgentChatLaunchRequest | null {
	const params = url.searchParams;
	if (params.get('open') !== 'agent-chat') return null;
	const skillId = normalizeLaunchSkillId(params.get('skill'));
	const draft =
		normalizeLaunchDraft(params.get('prompt')) ??
		(skillId ? `Use the ${skillId} skill on my current work.` : null);
	if (!draft) return null;
	return { draft, skillId, key: `${url.pathname}|${skillId ?? ''}|${draft}` };
}

function normalizeLaunchDraft(value: string | null): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	return trimmed.length > MAX_LAUNCH_DRAFT_CHARS
		? `${trimmed.slice(0, MAX_LAUNCH_DRAFT_CHARS)}...`
		: trimmed;
}
