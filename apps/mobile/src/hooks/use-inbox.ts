// apps/mobile/src/hooks/use-inbox.ts
//
// The inbox screen's data and answers. Reads GET /api/inbox (with payloads), check-ins, email
// updates and done-for-you in parallel; a side list that fails (not enabled for this account,
// or offline) just stays empty. Every answer goes through the cleared pile: the item hides at
// once, Undo works for five seconds, then it saves; a failure brings it back with the reason.
import {
	addressDecisionsFor,
	approveDecisionsFor,
	CLEANUP_CHANGED_MESSAGE,
	cleanupAnswerNote,
	dismissDecisionsFor,
	isCleanupItemSelectable,
	summarizeCleanupItemOutcome,
	type CleanupAskEntry
} from '@buildos/agentic-chat-client/inbox-cleanup-presentation';
import type {
	CheckInAnswer,
	CheckInProject,
	CheckInTask,
	CleanupDecisionRequest,
	DoneForYouEntry,
	EmailUpdateEntry,
	InboxItem
} from '@buildos/api-client';
import type { ProjectCleanupAnswer, ProjectCleanupItem } from '@buildos/shared-types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { api } from '@/lib/api';
import { targetParams } from '@/lib/chat/context';
import {
	attachCheckIns,
	buildInboxSections,
	inboxCardCount,
	inboxSummaryLine,
	type InboxSection
} from '@/lib/inbox/model';
import {
	hide,
	inboxPile,
	setNote,
	unhide,
	useInboxState,
	type HiddenKind,
	type InboxNote
} from '@/lib/inbox/inbox-store';
import type { PileJob, PileOutcome } from '@/lib/inbox/pile';
import { useAuth } from '@/providers/auth-provider';

export const INBOX_QUERY_ROOT = 'inbox';
const LIMIT = 100;

/** Empty instead of an error for the side lists. */
async function orEmpty<T>(load: () => Promise<T>, empty: T): Promise<T> {
	try {
		return await load();
	} catch {
		return empty;
	}
}

export type CleanupLineVerdict = 'apply' | 'done' | 'not_needed';

export function useInbox() {
	const { session } = useAuth();
	const userId = session?.user.id;
	const queryClient = useQueryClient();
	const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
	const { hidden, notes } = useInboxState();

	const items = useQuery({
		queryKey: [INBOX_QUERY_ROOT, 'items', userId],
		queryFn: () => api.inbox.list({ limit: LIMIT }),
		enabled: Boolean(userId)
	});
	const checkIns = useQuery({
		queryKey: [INBOX_QUERY_ROOT, 'check-ins', userId, timezone],
		queryFn: () =>
			orEmpty(() => api.inbox.checkIns({ timezone }), {
				projects: [] as CheckInProject[],
				time_zone: timezone,
				today: '',
				card_count: 0,
				task_count: 0
			}),
		enabled: Boolean(userId)
	});
	const emailUpdates = useQuery({
		queryKey: [INBOX_QUERY_ROOT, 'email', userId],
		queryFn: () => orEmpty(() => api.inbox.emailUpdates(), { items: [] as EmailUpdateEntry[] }),
		enabled: Boolean(userId)
	});
	const doneForYou = useQuery({
		queryKey: [INBOX_QUERY_ROOT, 'done-for-you', userId],
		queryFn: () => orEmpty(() => api.inbox.doneForYou(), { items: [] as DoneForYouEntry[] }),
		enabled: Boolean(userId)
	});

	// Saved answers stay hidden until the reload that no longer carries them lands.
	const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const savedRef = useRef<Array<{ kind: HiddenKind; ids: string[] }>>([]);
	const reloadSoon = useCallback(() => {
		if (reloadTimer.current) clearTimeout(reloadTimer.current);
		reloadTimer.current = setTimeout(() => {
			reloadTimer.current = null;
			const saved = savedRef.current;
			savedRef.current = [];
			void queryClient
				.invalidateQueries({ queryKey: [INBOX_QUERY_ROOT] })
				.finally(() => saved.forEach(({ kind, ids }) => unhide(kind, ids)));
		}, 400);
	}, [queryClient]);
	useEffect(
		() => () => {
			if (reloadTimer.current) clearTimeout(reloadTimer.current);
		},
		[]
	);

	// Going to the background sends what's waiting, the way the web sends on page close.
	useEffect(() => {
		const sub = AppState.addEventListener('change', (next) => {
			if (next !== 'active') inboxPile.flushAll();
		});
		return () => sub.remove();
	}, []);

	const itemSections = useMemo(
		() => buildInboxSections(items.data?.items ?? [], hidden),
		[items.data, hidden]
	);

	const visibleCheckIns = useMemo(
		() =>
			(checkIns.data?.projects ?? [])
				.map((project) => ({
					...project,
					groups: project.groups
						.map((group) => ({
							...group,
							tasks: group.tasks.filter(
								(task) => !hidden.items.has(`task:${task.id}`)
							)
						}))
						.filter((group) => group.tasks.length > 0)
				}))
				.filter(
					(project) =>
						!hidden.items.has(`project:${project.project_id}`) &&
						(project.quiet || project.groups.length > 0)
				),
		[checkIns.data, hidden]
	);
	const visibleEmail = useMemo(
		() =>
			(emailUpdates.data?.items ?? []).filter(
				(entry) => !hidden.items.has(`email:${entry.id}`)
			),
		[emailUpdates.data, hidden]
	);
	// Done-for-you entries of projects with an open cleanup list show on that list instead.
	const visibleDoneForYou = useMemo(() => {
		const onCards = new Set(
			itemSections.flatMap((section) => section.cleanups.map((c) => c.view.project_id))
		);
		return (doneForYou.data?.items ?? []).filter(
			(entry) =>
				!onCards.has(entry.project_id) && !hidden.autoApplied.has(entry.suggestion_id)
		);
	}, [doneForYou.data, itemSections, hidden]);

	const sections: InboxSection[] = useMemo(
		() => attachCheckIns(itemSections, visibleCheckIns),
		[itemSections, visibleCheckIns]
	);
	const cardCount = inboxCardCount(sections, visibleEmail.length);

	// ------------------------------------------------------------------------------------------
	// Answers

	const queue = useCallback(
		(input: {
			title: string;
			label: string;
			job: PileJob;
			kind: HiddenKind;
			ids: string[];
			/** Turns a settled outcome into a note, or null when it landed. */
			check?: (outcome: Extract<PileOutcome, { ok: true }>) => InboxNote | null;
		}) => {
			hide(input.kind, input.ids);
			input.ids.forEach((id) => setNote(id, null));
			inboxPile.add({
				title: input.title,
				label: input.label,
				job: input.job,
				onUndo: () => unhide(input.kind, input.ids),
				onResult: (outcome) => {
					const note = outcome.ok
						? (input.check?.(outcome) ?? null)
						: { tone: 'warn' as const, text: `Not saved: ${outcome.error}` };
					if (note) {
						unhide(input.kind, input.ids);
						input.ids.forEach((id) => setNote(id, note));
						return;
					}
					savedRef.current.push({ kind: input.kind, ids: input.ids });
					reloadSoon();
				}
			});
		},
		[reloadSoon]
	);

	/** Cleanup lines: one note per line from its rows' outcomes. */
	const queueCleanup = useCallback(
		(
			projectId: string,
			lines: ProjectCleanupItem[],
			decisions: CleanupDecisionRequest[],
			copy: { title: string; label: string }
		) => {
			if (!lines.length || !decisions.length) return;
			queue({
				...copy,
				job: { kind: 'cleanup', projectId, decisions },
				kind: 'cleanupItems',
				ids: lines.map((line) => line.id),
				check: (outcome) => {
					// One note per answer; any line that came back brings the answer back.
					for (const line of lines) {
						const result = summarizeCleanupItemOutcome(line, outcome.cleanup ?? []);
						if (result?.status === 'changed')
							return { tone: 'warn', text: CLEANUP_CHANGED_MESSAGE };
						if (result?.status === 'failed') {
							return {
								tone: 'warn',
								text: `Not applied: ${result.message ?? 'Could not apply this.'}`
							};
						}
					}
					return null;
				}
			});
		},
		[queue]
	);

	const answerLine = useCallback(
		(
			projectId: string,
			line: ProjectCleanupItem,
			verdict: CleanupLineVerdict,
			label?: string
		) => {
			if (verdict === 'apply' && !isCleanupItemSelectable(line)) return;
			const decisions =
				verdict === 'apply'
					? approveDecisionsFor([line])
					: verdict === 'done'
						? addressDecisionsFor(line)
						: dismissDecisionsFor(line, 'not_relevant');
			queueCleanup(projectId, [line], decisions, {
				title: line.title,
				label:
					label ??
					(verdict === 'apply'
						? 'Applied'
						: verdict === 'done'
							? 'Already handled'
							: 'Not needed')
			});
		},
		[queueCleanup]
	);

	const applyAll = useCallback(
		(projectId: string, lines: ProjectCleanupItem[]) => {
			const ready = lines.filter((line) => isCleanupItemSelectable(line));
			queueCleanup(projectId, ready, approveDecisionsFor(ready), {
				title: ready.length === 1 ? ready[0]!.title : `${ready.length} tidy-ups`,
				label: 'Applied'
			});
		},
		[queueCleanup]
	);

	const [openingChat, setOpeningChat] = useState(false);
	const [chatError, setChatError] = useState<string | null>(null);

	/** "Talk it through": a chat seeded with the item, opened in the project's context. */
	const talk = useCallback(
		async (item: InboxItem, cleanupLine?: ProjectCleanupItem | null) => {
			if (openingChat) return;
			setOpeningChat(true);
			setChatError(null);
			try {
				const result = await api.inbox.chatSession(
					item.id,
					cleanupLine ? { cleanup_item_id: cleanupLine.id } : {}
				);
				const projectId = result.project_id ?? item.project_id ?? null;
				const target = projectId
					? {
							type: 'project' as const,
							projectId,
							projectName: item.project?.name ?? 'Project'
						}
					: { type: 'global' as const };
				router.push({
					pathname: '/chat',
					params: {
						...targetParams(target),
						sessionId: result.chat_session_id,
						from: 'Inbox'
					}
				});
			} catch (error) {
				setChatError(error instanceof Error ? error.message : 'Could not open the chat.');
			} finally {
				setOpeningChat(false);
			}
		},
		[openingChat]
	);

	const answerAsk = useCallback(
		(
			item: InboxItem,
			projectId: string,
			entry: CleanupAskEntry,
			answer: ProjectCleanupAnswer
		) => {
			if (answer.action === 'chat') {
				void talk(item, entry.items[0] ?? null);
				return;
			}
			const copy = { title: entry.ask.question, label: answer.label };
			if (answer.action === 'note') {
				const first = entry.items[0];
				if (!first) return;
				const fingerprints = Object.fromEntries(
					entry.items.flatMap((line) =>
						line.rows.map(
							(row) => [row.suggestion_id, row.verified_fingerprint] as const
						)
					)
				);
				queue({
					...copy,
					job: {
						kind: 'call',
						run: async () => {
							await api.inbox.cleanupNote(projectId, {
								cleanup_item_id: first.id,
								note: cleanupAnswerNote(entry.ask.question, answer),
								expected_fingerprints: fingerprints
							});
						}
					},
					kind: 'cleanupItems',
					ids: entry.items.map((line) => line.id)
				});
				return;
			}
			const targets =
				answer.action === 'apply'
					? entry.items.filter((line) => isCleanupItemSelectable(line))
					: entry.items;
			const decisions =
				answer.action === 'apply'
					? approveDecisionsFor(targets)
					: answer.action === 'dismiss'
						? targets.flatMap((line) => dismissDecisionsFor(line, 'not_relevant'))
						: targets.flatMap((line) => addressDecisionsFor(line));
			queueCleanup(projectId, targets, decisions, copy);
		},
		[queue, queueCleanup, talk]
	);

	/** A whole card: approve, dismiss or snooze. */
	const decideCard = useCallback(
		(item: InboxItem, action: 'approve' | 'dismiss' | 'snooze') => {
			queue({
				title: item.title,
				label:
					action === 'approve'
						? 'Approved'
						: action === 'dismiss'
							? 'Dismissed'
							: 'Snoozed',
				job: {
					kind: 'call',
					run: async () => {
						if (action === 'snooze') await api.inbox.snooze(item.id);
						else
							await api.inbox.decide(
								item.id,
								action === 'approve' ? 'approve' : 'reject'
							);
					}
				},
				kind: 'items',
				ids: [item.id]
			});
		},
		[queue]
	);

	const snoozeCleanup = useCallback(
		(item: InboxItem) => {
			queue({
				title: item.project?.name ? `${item.project.name} cleanup` : 'Project cleanup',
				label: 'Snoozed',
				job: { kind: 'call', run: async () => void (await api.inbox.snooze(item.id)) },
				kind: 'items',
				ids: [item.id]
			});
		},
		[queue]
	);

	const answerTask = useCallback(
		(task: CheckInTask, answer: 'done' | 'drop' | 'move', dueAt?: string) => {
			const job: CheckInAnswer =
				answer === 'move'
					? { task_id: task.id, answer, due_at: dueAt }
					: { task_id: task.id, answer };
			queue({
				title: task.title,
				label: answer === 'done' ? 'Done' : answer === 'drop' ? 'Dropped' : 'Moved',
				job: { kind: 'check_in', answers: [job] },
				kind: 'items',
				ids: [`task:${task.id}`]
			});
		},
		[queue]
	);

	const markAllDone = useCallback(
		(project: CheckInProject) => {
			const tasks = project.groups.flatMap((group) => group.tasks);
			if (!tasks.length) return;
			queue({
				title: `${tasks.length} in ${project.project_name}`,
				label: 'Done',
				job: {
					kind: 'check_in',
					answers: tasks.map((task) => ({ task_id: task.id, answer: 'done' as const }))
				},
				kind: 'items',
				ids: tasks.map((task) => `task:${task.id}`)
			});
		},
		[queue]
	);

	const answerProject = useCallback(
		(project: CheckInProject, answer: 'pause' | 'finish') => {
			queue({
				title: project.project_name,
				label: answer === 'pause' ? 'Paused' : 'Finished',
				job: {
					kind: 'check_in',
					answers: [{ project_id: project.project_id, project_answer: answer }]
				},
				kind: 'items',
				ids: [`project:${project.project_id}`]
			});
		},
		[queue]
	);

	const decideEmail = useCallback(
		(entry: EmailUpdateEntry, decision: 'apply' | 'dismiss') => {
			queue({
				title: entry.title,
				label: decision === 'apply' ? 'Applied' : 'Not now',
				job: {
					kind: 'call',
					run: async () => {
						const result = await api.inbox.decideEmailUpdate(entry.id, decision);
						if (!result.ok) throw new Error(result.message);
					}
				},
				kind: 'items',
				ids: [`email:${entry.id}`]
			});
		},
		[queue]
	);

	/** Done for you → Undo. Itself an undo, so it runs at once (no pile). */
	const [undoing, setUndoing] = useState<string | null>(null);
	const undoAutoApplied = useCallback(
		async (projectId: string, suggestionId: string, undoUrl?: string) => {
			if (undoing) return;
			setUndoing(suggestionId);
			setNote(`auto:${suggestionId}`, null);
			try {
				if (undoUrl) await api.inbox.undoByUrl(undoUrl);
				else {
					const result = await api.inbox.undoCleanup(projectId, suggestionId);
					if (!result.ok) throw new Error('Could not undo this.');
				}
				hide('autoApplied', [suggestionId]);
				void queryClient.invalidateQueries({ queryKey: [INBOX_QUERY_ROOT] });
			} catch (error) {
				setNote(`auto:${suggestionId}`, {
					tone: 'warn',
					text: error instanceof Error ? error.message : 'Could not undo this.'
				});
			} finally {
				setUndoing(null);
			}
		},
		[queryClient, undoing]
	);

	const refresh = useCallback(
		() => queryClient.invalidateQueries({ queryKey: [INBOX_QUERY_ROOT] }),
		[queryClient]
	);

	return {
		loading: items.isPending,
		error: items.error,
		sections,
		emailUpdates: visibleEmail,
		doneForYou: visibleDoneForYou,
		cardCount,
		summary: items.isPending ? 'Loading inbox' : inboxSummaryLine(cardCount),
		notes,
		refresh,
		answerLine,
		applyAll,
		answerAsk,
		talk,
		openingChat,
		chatError,
		decideCard,
		snoozeCleanup,
		answerTask,
		markAllDone,
		answerProject,
		decideEmail,
		undoAutoApplied,
		undoing
	};
}

export type InboxController = ReturnType<typeof useInbox>;
