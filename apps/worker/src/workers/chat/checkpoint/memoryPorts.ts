// apps/worker/src/workers/chat/checkpoint/memoryPorts.ts
//
// In-memory checkpoint ports: the capture engine against a frozen project, with
// no database. Unit tests use them with canned model replies; the book-loop
// eval harness uses them with a live model (scripts/book-loop/capture-eval).
/* eslint-disable require-await -- in-memory fakes satisfy async ports without I/O */
import { stripStartHereManagedRegions } from '@buildos/shared-agent-ops/ontology/start-here';
import type { PromptEntity, PromptMessage } from './capturePrompts';
import type {
	CheckpointCapturePorts,
	CheckpointDocument,
	CheckpointRecord
} from './checkpointCapture';

export type MemoryCheckpointFixture = {
	timezone: string;
	project: { id: string; name: string | null; created_at: string | null };
	startHere: { id: string; content: string };
	thinkingLog?: { id: string; content: string } | null;
	entities: PromptEntity[];
	sessions: Array<{
		id: string;
		userId: string;
		title: string | null;
		messages: PromptMessage[];
	}>;
};

export type MemoryPendingReview = {
	runId: string;
	before: string;
	content: string;
	rationale: string;
	status: 'proposal_ready' | 'superseded';
};

export type MemoryCheckpointState = {
	startHere: CheckpointDocument;
	thinkingLog: CheckpointDocument | null;
	reviews: MemoryPendingReview[];
	records: CheckpointRecord[];
	watermarks: Map<string, string>;
	/** Per session, the last message the "chat" has produced so far (default: all). */
	visibleThrough: Map<string, string>;
	writes: number;
};

const PRIOR_CONTEXT_MESSAGES = 4;

export function createMemoryCheckpointPorts(
	fixture: MemoryCheckpointFixture,
	completeJson: CheckpointCapturePorts['completeJson']
): { ports: CheckpointCapturePorts; state: MemoryCheckpointState } {
	let clock = 0;
	const stampWrite = () => new Date(Date.UTC(2026, 0, 1) + ++clock * 1000).toISOString();
	const state: MemoryCheckpointState = {
		startHere: {
			id: fixture.startHere.id,
			content: fixture.startHere.content,
			updatedAt: null
		},
		thinkingLog: fixture.thinkingLog
			? { id: fixture.thinkingLog.id, content: fixture.thinkingLog.content, updatedAt: null }
			: null,
		reviews: [],
		records: [],
		watermarks: new Map(),
		visibleThrough: new Map(),
		writes: 0
	};

	const sessionMessages = (sessionId: string): PromptMessage[] => {
		const messages =
			fixture.sessions.find((session) => session.id === sessionId)?.messages ?? [];
		const through = state.visibleThrough.get(sessionId);
		const end = through
			? messages.findIndex((message) => message.id === through) + 1
			: messages.length;
		return messages.slice(0, end > 0 ? end : messages.length);
	};

	const ports: CheckpointCapturePorts = {
		async loadSession({ sessionId, userId }) {
			const session = fixture.sessions.find(
				(candidate) => candidate.id === sessionId && candidate.userId === userId
			);
			return session
				? { id: session.id, userId, projectId: fixture.project.id, title: session.title }
				: null;
		},
		async loadMessages(session) {
			const messages = sessionMessages(session.id);
			const watermark = state.watermarks.get(session.id);
			const start = watermark
				? messages.findIndex((message) => message.id === watermark) + 1
				: 0;
			return {
				newMessages: messages.slice(start),
				priorMessages: messages.slice(Math.max(0, start - PRIOR_CONTEXT_MESSAGES), start)
			};
		},
		async loadProject() {
			return {
				name: fixture.project.name,
				createdAt: fixture.project.created_at,
				timezone: fixture.timezone,
				startHere: state.startHere,
				thinkingLog: state.thinkingLog,
				entities: fixture.entities
			};
		},
		async loadPendingReview(_session, startHere) {
			const pending = state.reviews.filter((review) => review.status === 'proposal_ready');
			const newest = pending[pending.length - 1];
			const applies =
				newest &&
				stripStartHereManagedRegions(newest.before) ===
					stripStartHereManagedRegions(startHere.content);
			return {
				runIds: pending.map((review) => review.runId),
				effectiveContent: applies ? newest.content : null
			};
		},
		completeJson,
		async saveThinkingLog({ document, content }) {
			state.writes += 1;
			state.thinkingLog = {
				id: document?.id ?? `thinking-log-${fixture.project.id}`,
				content,
				updatedAt: stampWrite()
			};
			return state.thinkingLog;
		},
		async saveStartHere({ content }) {
			state.writes += 1;
			state.startHere = { ...state.startHere, content, updatedAt: stampWrite() };
			return state.startHere;
		},
		async stageStartHereReview({ document, content, rationale, supersedeRunIds }) {
			for (const review of state.reviews) {
				if (supersedeRunIds.includes(review.runId)) review.status = 'superseded';
			}
			const runId = `review-${state.reviews.length + 1}`;
			state.reviews.push({
				runId,
				before: document.content,
				content,
				rationale,
				status: 'proposal_ready'
			});
			return runId;
		},
		async supersedeStartHereReviews({ runIds }) {
			for (const review of state.reviews) {
				if (runIds.includes(review.runId)) review.status = 'superseded';
			}
		},
		async finishCheckpoint(record) {
			state.records.push(record);
			state.watermarks.set(record.sessionId, record.throughMessageId);
		}
	};
	return { ports, state };
}

/** Approve the newest pending review in memory, the way the AI Inbox commit would. */
export function approveMemoryReview(state: MemoryCheckpointState): boolean {
	const pending = state.reviews.filter((review) => review.status === 'proposal_ready');
	const newest = pending[pending.length - 1];
	if (
		!newest ||
		stripStartHereManagedRegions(newest.before) !==
			stripStartHereManagedRegions(state.startHere.content)
	) {
		return false;
	}
	state.startHere = { ...state.startHere, content: newest.content };
	newest.status = 'superseded';
	return true;
}
