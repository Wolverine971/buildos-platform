// apps/web/src/lib/components/agent/shared-document-edit-card-state.svelte.ts
//
// Resolutions made in this page session, keyed by card id. A card moves from
// under its thinking block to under the finished reply (and message rows can be
// re-keyed when a stream finalizes), so a resolved card must not depend on one
// component instance's state. After a reload the server copy on the tool result
// takes over (see shared-document-edit-cards.ts).
import { SvelteMap } from 'svelte/reactivity';
import type { SharedDocumentEditResolutionV1 } from '@buildos/shared-agent-ops/ontology/shared-document-edit-card';

export const sharedDocumentEditCardResolutions = new SvelteMap<
	string,
	SharedDocumentEditResolutionV1
>();
