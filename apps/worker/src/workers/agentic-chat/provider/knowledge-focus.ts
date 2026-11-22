// apps/worker/src/workers/agentic-chat/provider/knowledge-focus.ts
//
// A chat about one knowledge entry (a person, an organization…). Web admission loaded
// everything BuildOS holds on the entry with the user's own access and appended it to the turn
// artifact as one prompt section (`knowledge_focus`, see focus-brief.ts in shared-agent-ops).
// Here the worker places that block after the user's message; request-builders.ts keeps the
// knowledge and web tools mounted, so "find out more about him" can search with its leads.
//
// Structured only: the section exists because the user picked an entry; nothing reads the message.

import {
	readKnowledgeFocusSection,
	type KnowledgeFocusRef
} from '@buildos/shared-agent-ops/knowledge';
import type { AgenticChatTurnProviderRequestV1 } from './contracts';
import { appendSystemInstruction } from './request-builders';
import type { AgenticChatWorkerExecutionInputV1 } from '../turn/execution-input';

/** The entry this turn is about, from the artifact's appended section; null on ordinary turns. */
export function knowledgeFocusOf(promptSections: unknown): KnowledgeFocusRef | null {
	return readKnowledgeFocusSection(promptSections)?.focus ?? null;
}

/**
 * Append the focus brief after the user message (opening pass). Continuations inherit the
 * message list, so the brief holds for the whole turn; the next turn gets a fresh one.
 */
export function appendKnowledgeFocus(
	request: AgenticChatTurnProviderRequestV1,
	executionInput: Pick<AgenticChatWorkerExecutionInputV1, 'artifact'>
): AgenticChatTurnProviderRequestV1 {
	const section = readKnowledgeFocusSection(executionInput.artifact.prepared.promptSections);
	return section ? appendSystemInstruction(request, section.content) : request;
}
