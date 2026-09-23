// apps/worker/tests/publishedSpecialistExecution.postgres.test.ts
// Real admission, ownership, worker execution and durable recovery; scripted provider, no paid calls.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
	createSpecialistWorkbenchDraftV1,
	createSpecialistStarterDraftV1,
	buildDocumentReadSnapshotV2,
	hashExecutableSpecialistSnapshot
} from '@buildos/agentic-chat-runtime/specialists';
import type { JevDecider } from '@buildos/smart-llm';
import {
	recommendPublishedSpecialist,
	loadSelectedSpecialistRecommendation
} from '../../web/src/lib/services/agentic-chat-v2/specialist-recommendations.server';
import {
	saveSpecialistWorkbenchDraft,
	publishSpecialistWorkbenchVersion,
	type SpecialistWorkbenchClient
} from '../../web/src/lib/services/agentic-chat-v2/specialist-workbench.server';
import {
	buildAgenticChatWorkflowV4AdmissionArgs,
	admitAgenticChatWorkflowV4Turn
} from '../../web/src/lib/services/agentic-chat-v2/worker-turn-workflow-admission.server';
import {
	createPgSupabaseShim,
	serviceClient,
	startDisposableWorkflowPostgres,
	postgresAvailable,
	type DisposablePostgres
} from './helpers/workflowPostgres';
import {
	seedE2EOwner,
	E2E_USER_ID,
	E2E_PROJECT_ID,
	buildE2EWorker,
	leaseAndClaimE2E,
	e2eProjectContext,
	e2eFacts
} from './helpers/workflowEndToEnd';
import {
	scriptedWorkflowProvider,
	type ScriptedCall,
	type ScriptedReply
} from './helpers/workflowProviderScript';
import { SupabaseAgenticChatWorkflowStore } from '../src/workers/agentic-chat/workflow/workflow-store';
import {
	findProjectContext,
	type ContextFinderDecider
} from '@buildos/agentic-chat-runtime/context-finder';
import type { WorkflowContextFinderPortV1 } from '../src/workers/agentic-chat/workflow/context-finder-port';
const DOC = 'fd000000-0000-4000-8000-000000000001';
const VERSION = '2026-09-19T00:00:00Z';
const NOTE = 'CUSTOM REFERENCE: group decisions separately from working notes.';
function script(call: ScriptedCall): ScriptedReply {
	if (call.role === 'planner')
		return {
			kind: 'text',
			text: JSON.stringify({ analyst: 'Assess documents.', reviewer: 'Challenge evidence.' })
		};
	if (call.role === 'editor')
		return { kind: 'text', text: 'Keep a separate decisions document. No changes were made.' };
	if (call.role === 'project_analyst' && call.body.tool_choice === 'auto')
		return {
			kind: 'text',
			text: '',
			toolCalls: [
				{
					id: 'doc-read',
					name: 'read_project_documents',
					arguments: { documentIds: [DOC] }
				}
			]
		};
	return {
		kind: 'text',
		text: JSON.stringify({
			summary: 'Preserve useful distinctions.',
			findings: [{ claim: 'Inspect the saved brief.', basis: 'recorded', evidence: [DOC] }],
			risks: [],
			unknowns: [],
			recommendation: 'Separate decisions and working notes.'
		})
	};
}
(postgresAvailable ? describe : describe.skip)(
	'published specialist execution against PostgreSQL',
	() => {
		let pg: DisposablePostgres,
			admin: Client,
			service: Client,
			shim: ReturnType<typeof createPgSupabaseShim>,
			catalog: SpecialistWorkbenchClient;
		beforeAll(async () => {
			const root = resolve(process.cwd(), '../..');
			pg = await startDisposableWorkflowPostgres(root, 'buildos-published-specialist-pg-');
			admin = new Client(pg.connection);
			await admin.connect();
			await admin.query(
				'CREATE TABLE public.onto_documents (id uuid PRIMARY KEY, project_id uuid, title text, content text, updated_at timestamptz, deleted_at timestamptz); GRANT SELECT ON public.onto_documents TO service_role;'
			);
			for (const migration of [
				'20260920010743_agentic_chat_specialist_snapshots_v2.sql',
				'20260920032259_agentic_chat_document_read_tools_v1.sql',
				'20260920041644_agentic_chat_specialist_selection_shadow_v1.sql',
				'20260920154843_agentic_chat_document_evidence_handoff_v1.sql',
				'20260920162616_agentic_chat_specialist_workbench_v1.sql',
				'20260921002731_agentic_chat_published_specialist_execution_v1.sql',
				'20260921041759_agentic_chat_specialist_recommendations_v1.sql'
			]) {
				try {
					await admin.query(
						readFileSync(resolve(root, 'supabase/migrations', migration), 'utf8')
					);
				} catch (e) {
					throw new Error(migration + ': ' + JSON.stringify(e));
				}
			}
			await seedE2EOwner(admin);
			await admin.query('INSERT INTO public.onto_documents VALUES ($1,$2,$3,$4,$5,NULL)', [
				DOC,
				E2E_PROJECT_ID,
				'Workshop brief',
				'Venue capacity is 40.',
				VERSION
			]);
			service = await serviceClient(pg.connection);
			shim = createPgSupabaseShim(service);
			catalog = shim as unknown as SpecialistWorkbenchClient;
		}, 120000);
		afterAll(async () => {
			await service?.end();
			await admin?.end();
			pg?.stop();
		});
		async function version(read = true) {
			const id = randomUUID(),
				draft = createSpecialistWorkbenchDraftV1();
			draft.instructions = 'Use domain expertise to compare working notes and decisions.';
			draft.knowledge[0]!.text = NOTE;
			draft.documentReadEnabled = read;
			if (!read) draft.examples = draft.examples.filter((e) => !e.requiresDocumentRead);
			await saveSpecialistWorkbenchDraft(catalog, E2E_USER_ID, id, 0, draft);
			return {
				...(await publishSpecialistWorkbenchVersion(catalog, E2E_USER_ID, id, 1)),
				draft,
				id
			};
		}
		async function args(published: Awaited<ReturnType<typeof version>>, handoff = false) {
			return buildAgenticChatWorkflowV4AdmissionArgs({
				userId: E2E_USER_ID,
				command: { clientTurnId: randomUUID(), streamRunId: randomUUID(), sessionId: null },
				eligibility: {
					eligible: true,
					projectId: E2E_PROJECT_ID,
					message: 'Review the saved documents and propose structure.',
					profile: 'document_organization',
					documentReadTools: true,
					documentEvidenceHandoff: handoff
				},
				published: {
					snapshot: published.snapshot,
					snapshotHash: published.version.snapshotHash
				},
				transportDecisionId: randomUUID()
			});
		}
		function context() {
			const c = e2eProjectContext(E2E_PROJECT_ID) as any;
			c.data.documents = [{ id: DOC, title: 'Workshop brief', updated_at: VERSION }];
			return c;
		}
		it.each([false, true])(
			'executes the exact frozen knowledge and bounded tool with shared evidence=%s',
			async (handoff) => {
				const v = await version(),
					a = await args(v, handoff);
				expect(
					(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: a }))
						.outcome
				).toBe('newly_admitted');
				v.draft.knowledge[0]!.text = 'LATER DRAFT KNOWLEDGE';
				await saveSpecialistWorkbenchDraft(catalog, E2E_USER_ID, v.id, 1, v.draft);
				const next = await publishSpecialistWorkbenchVersion(catalog, E2E_USER_ID, v.id, 2);
				const retry = await args(v, handoff);
				Object.assign(retry, {
					p_client_turn_id: a.p_client_turn_id,
					p_stream_run_id: a.p_stream_run_id,
					p_request_hash: a.p_request_hash
				});
				expect(
					(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: retry }))
						.outcome
				).toBe('matching_duplicate');
				const changed = await buildAgenticChatWorkflowV4AdmissionArgs({
					userId: E2E_USER_ID,
					command: {
						clientTurnId: a.p_client_turn_id,
						streamRunId: a.p_stream_run_id,
						sessionId: null
					},
					eligibility: {
						eligible: true,
						projectId: E2E_PROJECT_ID,
						message: a.p_message,
						profile: 'document_organization',
						documentReadTools: true,
						documentEvidenceHandoff: handoff
					},
					published: { snapshot: next.snapshot, snapshotHash: next.version.snapshotHash },
					transportDecisionId: randomUUID()
				});
				expect(
					(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: changed }))
						.outcome
				).toBe('idempotency_conflict');
				const provider = scriptedWorkflowProvider(script);
				const worker = buildE2EWorker({
					shim,
					client: provider.client,
					specialistWorkflowsEnabled: true,
					documentReadToolsEnabled: true,
					documentEvidenceHandoffEnabled: handoff,
					publishedSpecialistsEnabled: true,
					context: context()
				});
				try {
					expect(
						await worker.execute(await leaseAndClaimE2E(admin, shim, a.p_turn_run_id))
					).toMatchObject({ terminalStatus: 'completed' });
				} finally {
					await worker.stop();
				}
				const organizer = provider.callsFor('project_analyst');
				expect(organizer).toHaveLength(2);
				for (const call of organizer) {
					expect(call.body.messages[0].content).toContain('Use domain expertise');
					expect(call.body.messages[1].content).toContain(NOTE);
					expect(call.body.messages[1].content).not.toContain('LATER DRAFT KNOWLEDGE');
				}
				for (const call of provider.calls.filter((c) => c.role !== 'project_analyst')) {
					expect(call.body.tool_choice).toBe('none');
					expect(call.body.messages[1].content).not.toContain(NOTE);
				}
				const resumed = await new SupabaseAgenticChatWorkflowStore(shim as never).loadRun(
					a.p_turn_run_id
				);
				expect(resumed!.specialistSnapshot).toEqual(a.p_specialist_snapshot);
				expect(resumed!.documentReadResult?.documents).toEqual([
					expect.objectContaining({
						id: DOC,
						content: 'Venue capacity is 40.'
					})
				]);
				expect((await e2eFacts(admin, a.p_turn_run_id)).effects).toBe(0);
			},
			60000
		);
		it.each([false, true])(
			'freezes Jev-selected evidence into the checkpoint for every role (finder fails=%s)',
			async (fails) => {
				const MEMO = 'fd000000-0000-4000-8000-0000000000aa';
				const question = 'What does land cost for the school?';
				const scripted: ContextFinderDecider = {
					decide: async (request) => ({
						ok: true,
						answers: Object.fromEntries(
							Object.keys(request.questions).map((key) => [
								key,
								{
									type: 'noul',
									noul: key === 'e_d0' || key === 'h_d0_0' ? 0.9 : 0.1
								}
							])
						),
						receipt: {
							modelRequested: 'typesafe/jev-1.13',
							modelUsed: 'typesafe/jev-1.13',
							requestId: 'scripted',
							inputTokens: 10,
							outputTokens: 1,
							costUsd: 0.0005,
							durationMs: 5,
							requestBytes: 100,
							questionCount: Object.keys(request.questions).length,
							attempts: 1
						}
					})
				};
				// The real shared finder over an in-memory project: the memo is not in the
				// specialist's bounded inventory, so only the finder can surface it.
				const findContext = vi.fn<WorkflowContextFinderPortV1>(async (input) => {
					if (fails) throw new Error('offline');
					return (
						await findProjectContext({
							project: {
								project: { id: E2E_PROJECT_ID, name: 'Workshop launch' },
								documents: [
									{
										id: MEMO,
										title: 'Budget memo',
										updated_at: VERSION,
										content:
											'## Land\nLand is $150K per acre.\n## Staff\nTwo teachers.'
									}
								],
								tasks: [],
								goals: [],
								plans: [],
								milestones: [],
								risks: []
							},
							message: input.question,
							decider: scripted,
							signal: input.signal
						})
					).evidence;
				});
				const v = await version();
				const a = await buildAgenticChatWorkflowV4AdmissionArgs({
					userId: E2E_USER_ID,
					command: {
						clientTurnId: randomUUID(),
						streamRunId: randomUUID(),
						sessionId: null
					},
					eligibility: {
						eligible: true,
						projectId: E2E_PROJECT_ID,
						message: question,
						profile: 'document_organization',
						documentReadTools: true,
						documentEvidenceHandoff: true
					},
					published: {
						snapshot: v.snapshot,
						snapshotHash: v.version.snapshotHash,
						contextFinder: { version: 'context_finder_request_v1', mode: 'auto' }
					},
					transportDecisionId: randomUUID()
				});
				expect(
					(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: a }))
						.outcome
				).toBe('newly_admitted');
				const cite = fails ? DOC : MEMO;
				const provider = scriptedWorkflowProvider((call) =>
					call.role === 'planner'
						? {
								kind: 'text',
								text: JSON.stringify({
									analyst: 'Find costs.',
									reviewer: 'Check costs.'
								})
							}
						: call.role === 'editor'
							? {
									kind: 'text',
									text: 'Land is $150K per acre. No changes were made.'
								}
							: {
									kind: 'text',
									text: JSON.stringify({
										summary: 'Land cost is recorded.',
										findings: [
											{
												claim: 'Land cost is recorded.',
												basis: 'recorded',
												evidence: [cite]
											}
										],
										risks: [],
										unknowns: [],
										recommendation: 'Confirm the acreage.'
									})
								}
				);
				const errors: { stage: string }[] = [];
				const worker = buildE2EWorker({
					shim,
					client: provider.client,
					specialistWorkflowsEnabled: true,
					documentReadToolsEnabled: true,
					documentEvidenceHandoffEnabled: true,
					publishedSpecialistsEnabled: true,
					findContext,
					context: context(),
					onError: (report) => errors.push(report)
				});
				try {
					expect(
						await worker.execute(await leaseAndClaimE2E(admin, shim, a.p_turn_run_id))
					).toMatchObject({ terminalStatus: 'completed' });
				} finally {
					await worker.stop();
				}
				expect(findContext).toHaveBeenCalledOnce();
				expect(findContext.mock.calls[0]![0]).toMatchObject({
					userId: E2E_USER_ID,
					projectId: E2E_PROJECT_ID,
					question,
					request: { mode: 'auto' }
				});
				const run = await new SupabaseAgenticChatWorkflowStore(shim as never).loadRun(
					a.p_turn_run_id
				);
				const selected = (run!.context!.payload.data as any).selected_evidence;
				for (const role of [
					'planner',
					'project_analyst',
					'risk_reviewer',
					'editor'
				] as const)
					for (const call of provider.callsFor(role))
						expect(call.body.messages[1].content).toContain(
							fails ? 'Relevance ranking was unavailable' : 'Land is $150K per acre.'
						);
				if (fails) {
					expect(selected).toMatchObject({ status: 'unavailable', full: [] });
					expect(errors.map((e) => e.stage)).toContain('context_finder');
				} else {
					expect(selected).toMatchObject({
						status: 'selected',
						source: 'jev',
						full: [
							{
								id: MEMO,
								excerpts: [
									{ heading: 'Land', text: '## Land\nLand is $150K per acre.' }
								]
							}
						],
						ranker: { status: 'ranked', costUsd: 0.001 }
					});
					expect(run!.context!.evidenceVersions.map((e) => e.id)).toContain(MEMO);
				}
				const facts = await e2eFacts(admin, a.p_turn_run_id);
				// Both specialists' reports cite the selected record and are accepted first try.
				expect(
					facts.steps
						.filter((row) =>
							['project_analyst', 'risk_reviewer'].includes(row.step_key)
						)
						.map((row) => [row.step_key, row.status, row.attempts_used])
				).toEqual([
					['project_analyst', 'accepted', 1],
					['risk_reviewer', 'accepted', 1]
				]);
				expect(facts.effects).toBe(0);
			},
			60000
		);
		it('enforces no-tool capability at both worker and SQL boundaries', async () => {
			const v = await version(false),
				a = await args(v);
			await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: a });
			const lease = await leaseAndClaimE2E(admin, shim, a.p_turn_run_id);
			const denied = await service.query(
				'SELECT public.read_agentic_chat_documents_v1($1,$2,$3,$4,$5,$6::jsonb) AS result',
				[
					a.p_turn_run_id,
					lease.job,
					lease.token,
					lease.claim.executionGeneration,
					randomUUID(),
					JSON.stringify([DOC])
				]
			);
			expect(denied.rows[0].result.outcome).toBe('tool_not_allowed');
			const provider = scriptedWorkflowProvider(script),
				worker = buildE2EWorker({
					shim,
					client: provider.client,
					specialistWorkflowsEnabled: true,
					documentReadToolsEnabled: true,
					publishedSpecialistsEnabled: true,
					context: context()
				});
			try {
				expect(await worker.execute(lease)).toMatchObject({ terminalStatus: 'completed' });
			} finally {
				await worker.stop();
			}
			expect(provider.calls.every((c) => c.body.tool_choice === 'none')).toBe(true);
			expect(provider.callsFor('project_analyst')[0]!.body.messages[1].content).toContain(
				NOTE
			);
		});
		it('fails before provider dispatch with the new worker flag disabled', async () => {
			const a = await args(await version());
			await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: a });
			const provider = scriptedWorkflowProvider(script),
				worker = buildE2EWorker({
					shim,
					client: provider.client,
					specialistWorkflowsEnabled: true,
					documentReadToolsEnabled: true,
					context: context()
				});
			try {
				expect(
					await worker.execute(await leaseAndClaimE2E(admin, shim, a.p_turn_run_id))
				).toMatchObject({ terminalStatus: 'failed' });
			} finally {
				await worker.stop();
			}
			expect(provider.calls).toHaveLength(0);
		});
		it('rejects foreign or substituted catalog contents and built-in/custom retry changes', async () => {
			const a = await args(await version());
			const foreign = structuredClone(a);
			foreign.p_user_id = randomUUID();
			expect(
				(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: foreign }))
					.outcome
			).toBe('access_denied');
			const tampered = structuredClone(a);
			tampered.p_specialist_snapshot!.slots.project_analyst.definition = {
				...tampered.p_specialist_snapshot!.slots.project_analyst.definition,
				label: 'Forged'
			};
			tampered.p_specialist_snapshot_hash = await hashExecutableSpecialistSnapshot(
				tampered.p_specialist_snapshot
			);
			await expect(
				admitAgenticChatWorkflowV4Turn({ client: shim as never, args: tampered })
			).rejects.toThrow('binding_invalid');
			await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: a });
			const builtin = {
				...a,
				p_specialist_snapshot: buildDocumentReadSnapshotV2(),
				p_turn_run_id: randomUUID(),
				p_user_message_id: randomUUID(),
				p_request_artifact_id: randomUUID()
			};
			builtin.p_specialist_snapshot_hash = await hashExecutableSpecialistSnapshot(
				builtin.p_specialist_snapshot
			);
			expect(
				(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: builtin }))
					.outcome
			).toBe('idempotency_conflict');
			// Clean this queued test request without inference.
			await admin.query(
				"UPDATE public.queue_jobs SET status='failed' WHERE id=(SELECT queue_job_id FROM public.chat_turn_runs WHERE id=$1)",
				[a.p_turn_run_id]
			);
		});
		it('still admits built-in reviews and rejects retrying them with a custom version', async () => {
			const a = await args(await version());
			const builtin = { ...a, p_specialist_snapshot: buildDocumentReadSnapshotV2() };
			builtin.p_specialist_snapshot_hash = await hashExecutableSpecialistSnapshot(
				builtin.p_specialist_snapshot
			);
			expect(
				(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: builtin }))
					.outcome
			).toBe('newly_admitted');
			expect(
				(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: a })).outcome
			).toBe('idempotency_conflict');
			const provider = scriptedWorkflowProvider(script);
			const worker = buildE2EWorker({
				shim,
				client: provider.client,
				specialistWorkflowsEnabled: true,
				documentReadToolsEnabled: true,
				context: context()
			});
			try {
				expect(
					await worker.execute(await leaseAndClaimE2E(admin, shim, a.p_turn_run_id))
				).toMatchObject({ terminalStatus: 'completed' });
			} finally {
				await worker.stop();
			}
		});
		it('pins one Jev recommendation, replays without billing, and binds its receipt to admission', async () => {
			const id = randomUUID();
			const draft = createSpecialistStarterDraftV1('research_synthesizer');
			await saveSpecialistWorkbenchDraft(catalog, E2E_USER_ID, id, 0, draft);
			const published = await publishSpecialistWorkbenchVersion(catalog, E2E_USER_ID, id, 1);
			const question = 'What do the saved sources say about this project?';
			const requestId = randomUUID();
			const decide = vi.fn(async (request: any) => {
				const criteria = request.questions.specialist.criteria as Record<string, string>;
				const keys = Object.keys(criteria);
				const chosen = keys.find((key) => criteria[key]!.includes('Research synthesizer'))!;
				const probabilities = Object.fromEntries(
					keys.map((key) => [key, key === chosen ? 0.85 : 0.15 / (keys.length - 1)])
				);
				return {
					ok: true,
					answers: {
						specialist: {
							type: 'choice',
							choice: chosen,
							probabilities,
							confidence: 0.85
						}
					},
					receipt: {
						modelRequested: 'typesafe/jev-1.13',
						modelUsed: 'typesafe/jev-1.13',
						requestId: 'mock-request',
						inputTokens: 80,
						outputTokens: 10,
						costUsd: 0.0001,
						durationMs: 18,
						requestBytes: 1200,
						questionCount: 1,
						attempts: 1
					}
				};
			});
			const request = {
				client: catalog,
				decider: { decide } as unknown as JevDecider,
				userId: E2E_USER_ID,
				projectId: E2E_PROJECT_ID,
				requestId,
				question
			};
			const first = await recommendPublishedSpecialist(request);
			expect(first).toMatchObject({
				status: 'selected',
				selected: { draftId: id, version: 1 }
			});
			expect(await recommendPublishedSpecialist(request)).toEqual(first);
			expect(decide).toHaveBeenCalledOnce();
			await expect(
				recommendPublishedSpecialist({ ...request, question: 'Another question' })
			).rejects.toMatchObject({ status: 409 });
			await expect(
				recommendPublishedSpecialist({ ...request, userId: randomUUID() })
			).rejects.toMatchObject({ status: 404 });
			expect(decide).toHaveBeenCalledOnce();
			const selected = {
				draftId: id,
				version: 1,
				snapshotHash: published.version.snapshotHash
			};
			const receipt = await loadSelectedSpecialistRecommendation({
				client: catalog,
				userId: E2E_USER_ID,
				id: requestId,
				projectId: E2E_PROJECT_ID,
				question,
				selected
			});
			await expect(
				loadSelectedSpecialistRecommendation({
					client: catalog,
					userId: E2E_USER_ID,
					id: requestId,
					projectId: E2E_PROJECT_ID,
					question: 'Different question',
					selected
				})
			).rejects.toMatchObject({ status: 409 });
			const admission = await buildAgenticChatWorkflowV4AdmissionArgs({
				userId: E2E_USER_ID,
				command: { clientTurnId: randomUUID(), streamRunId: randomUUID(), sessionId: null },
				eligibility: {
					eligible: true,
					projectId: E2E_PROJECT_ID,
					message: question,
					profile: 'document_organization',
					documentReadTools: true
				},
				published: {
					snapshot: published.snapshot,
					snapshotHash: selected.snapshotHash,
					recommendation: receipt
				},
				transportDecisionId: randomUUID()
			});
			expect(
				(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args: admission }))
					.outcome
			).toBe('newly_admitted');
			const saved = await admin.query(
				'SELECT snapshot FROM public.chat_turn_specialist_snapshots WHERE turn_run_id=$1',
				[admission.p_turn_run_id]
			);
			expect(saved.rows[0].snapshot.recommendation).toEqual(receipt);
			const tampered = await buildAgenticChatWorkflowV4AdmissionArgs({
				userId: E2E_USER_ID,
				command: { clientTurnId: randomUUID(), streamRunId: randomUUID(), sessionId: null },
				eligibility: {
					eligible: true,
					projectId: E2E_PROJECT_ID,
					message: question,
					profile: 'document_organization',
					documentReadTools: true
				},
				published: { snapshot: published.snapshot, snapshotHash: selected.snapshotHash },
				transportDecisionId: randomUUID()
			});
			(tampered.p_specialist_snapshot as { recommendation?: typeof receipt }).recommendation =
				structuredClone(receipt);
			(
				tampered.p_specialist_snapshot as { recommendation: typeof receipt }
			).recommendation.input.question = 'A different question';
			tampered.p_specialist_snapshot_hash = await hashExecutableSpecialistSnapshot(
				tampered.p_specialist_snapshot
			);
			await expect(
				admitAgenticChatWorkflowV4Turn({ client: shim as never, args: tampered })
			).rejects.toThrow('specialist_recommendation_snapshot_binding_invalid');
			await admin.query('SET ROLE authenticated');
			try {
				await expect(
					admin.query('SELECT * FROM public.agentic_chat_specialist_recommendations')
				).rejects.toThrow('permission denied');
				await expect(
					admin.query(
						'SELECT public.begin_specialist_recommendation_v1(NULL,NULL,NULL,NULL)'
					)
				).rejects.toThrow('permission denied');
			} finally {
				await admin.query('RESET ROLE');
			}
		});
		it('records tiny Jev probabilities and costs that PostgreSQL re-canonicalizes', async () => {
			// PostgreSQL prints 3e-7 as 0.0000003, so a raw JavaScript hash of it never matches.
			const probe = await admin.query(
				`SELECT public.agentic_chat_canonical_json_v1('{"costUsd":3e-7}'::jsonb) AS canonical`
			);
			expect(probe.rows[0].canonical).toBe('{"costUsd":0.0000003}');
			const id = randomUUID();
			await saveSpecialistWorkbenchDraft(
				catalog,
				E2E_USER_ID,
				id,
				0,
				createSpecialistStarterDraftV1('evidence_reviewer')
			);
			await publishSpecialistWorkbenchVersion(catalog, E2E_USER_ID, id, 1);
			const decide = vi.fn(async (request: any) => {
				const keys = Object.keys(request.questions.specialist.criteria as object);
				const chosen = keys.find((key) => key !== 'none')!;
				const rest = keys.filter((key) => key !== chosen);
				const probabilities = Object.fromEntries([
					[chosen, 1 - 2e-7 * rest.length],
					...rest.map((key) => [key, 2e-7])
				]);
				return {
					ok: true,
					answers: {
						specialist: {
							type: 'choice',
							choice: chosen,
							probabilities,
							confidence: 0.99
						}
					},
					receipt: {
						modelRequested: 'typesafe/jev-1.13',
						modelUsed: 'typesafe/jev-1.13',
						requestId: 'mock-tiny',
						inputTokens: 80,
						outputTokens: 10,
						costUsd: 3e-7,
						durationMs: 0.4,
						requestBytes: 1200,
						questionCount: 1,
						attempts: 1
					}
				};
			});
			const result = await recommendPublishedSpecialist({
				client: catalog,
				decider: { decide } as unknown as JevDecider,
				userId: E2E_USER_ID,
				projectId: E2E_PROJECT_ID,
				requestId: randomUUID(),
				question: 'Which saved claims are weakly supported?'
			});
			expect(result).toMatchObject({ status: 'selected', costUsd: 0, durationMs: 0 });
		});
	}
);
