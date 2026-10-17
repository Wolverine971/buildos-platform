// apps/web/src/lib/components/agent/proposal-card-state.svelte.ts
//
// What happened to proposal cards in this page session, keyed by card id. A
// card moves from under its thinking block to under the finished reply (and
// message rows can be re-keyed when a stream finalizes), so its outcome and its
// latest "Check again" view must not live in one component instance. After a
// reload the server's mirror on the tool result takes over (proposal-cards.ts).
import { SvelteMap } from 'svelte/reactivity';
import type {
	ProposalCardResolutionV1,
	ProposalCardUndoV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';

export const proposalCardResolutions = new SvelteMap<string, ProposalCardResolutionV1>();
export const proposalCardUndos = new SvelteMap<string, ProposalCardUndoV1>();
/** The latest preview the server returned (Check again, or a 409 PREVIEW_CHANGED). */
export const proposalCardFreshViews = new SvelteMap<string, { payload: unknown; digest: string }>();

export function clearProposalCardState(): void {
	proposalCardResolutions.clear();
	proposalCardUndos.clear();
	proposalCardFreshViews.clear();
}
