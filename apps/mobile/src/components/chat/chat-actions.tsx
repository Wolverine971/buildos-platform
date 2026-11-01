// apps/mobile/src/components/chat/chat-actions.tsx
// What a row can ask the chat to do. Rows render from a module-level renderItem (no
// closures), so the screen hands these down through context instead of props.
import { createContext, useContext } from 'react';

import type { CreatedEntity } from '@/lib/chat/changes';

export type ChatActions = {
	/** Answer a proposal card: `apply`, `cancel`, or a combine choice. */
	chooseProposal: (cardId: string, choice: string) => Promise<void>;
	undoProposal: (cardId: string) => Promise<void>;
	/** Undo one document or table change on a changes row. */
	undoChange: (rowId: string, changeId: string) => Promise<void>;
	/**
	 * Open something the agent made or edited: tasks and docs in the reader, a project on its
	 * page, the rest (goals, plans, milestones, risks) on the website.
	 */
	openEntity: (entity: CreatedEntity) => void;
	/** Open something on the website, signed in (for what the phone does not render yet). */
	openOnWeb: (path: string) => void;
	/** A reply is streaming; choices wait for it. */
	turnActive: boolean;
};

const noop = async () => {};

export const ChatActionsContext = createContext<ChatActions>({
	chooseProposal: noop,
	undoProposal: noop,
	undoChange: noop,
	openEntity: () => {},
	openOnWeb: () => {},
	turnActive: false
});

export function useChatActions(): ChatActions {
	return useContext(ChatActionsContext);
}
