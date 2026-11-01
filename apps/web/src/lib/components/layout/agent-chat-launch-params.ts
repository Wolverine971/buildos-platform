// apps/web/src/lib/components/layout/agent-chat-launch-params.ts
import { normalizeLaunchSkillId } from '$lib/utils/agent-chat-launch';
import { isLaunchDraftStashId } from '$lib/utils/launch-draft-stash';

/**
 * Query params of a chat launch (`/?open=agent-chat&skill=<id>&prompt=<draft>`, the
 * public "Try in BuildOS" link). Navigation consumes them once and strips them all.
 */
export const AGENT_CHAT_LAUNCH_PARAMS = ['open', 'skill', 'prompt', 'draft'] as const;

const MAX_LAUNCH_DRAFT_CHARS = 2400;

export type AgentChatLaunchRequest = {
	/** Text placed in the composer for the user to send. */
	draft: string;
	/** Structured runtime skill id, sent with the launch's first turn; null when absent or malformed. */
	skillId: string | null;
	/** Identity of this launch, so a replayed URL never opens a second chat. */
	key: string;
	/**
	 * Id of the full draft waiting in this browser (`$lib/utils/launch-draft-stash`) when
	 * `prompt` is only a preview of a long paste; null otherwise.
	 */
	stashId: string | null;
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
	const stashedDraft = params.get('draft');
	const stashId = isLaunchDraftStashId(stashedDraft) ? stashedDraft : null;
	return { draft, skillId, key: `${url.pathname}|${skillId ?? ''}|${draft}`, stashId };
}

function normalizeLaunchDraft(value: string | null): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	return trimmed.length > MAX_LAUNCH_DRAFT_CHARS
		? `${trimmed.slice(0, MAX_LAUNCH_DRAFT_CHARS)}...`
		: trimmed;
}
