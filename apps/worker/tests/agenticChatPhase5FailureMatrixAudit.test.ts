// apps/worker/tests/agenticChatPhase5FailureMatrixAudit.test.ts
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type FailureEvidence = {
	id: string;
	requirement: string;
	file: string;
	anchor: string;
};

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Executable coverage ledger for every Phase 5 failure-injection branch.
 *
 * The owning tests remain focused and readable in their native worker, web,
 * and disposable-PostgreSQL suites. This audit makes that distributed proof
 * fail loudly when a case or its exact evidence disappears during refactors.
 */
const PHASE_5_FAILURE_EVIDENCE: readonly FailureEvidence[] = Object.freeze([
	{
		id: 'admission_duplicate_post',
		requirement: 'Concurrent duplicate POST admission creates one durable winner.',
		file: 'supabase/tests/20260802020000_agentic_chat_worker_atomic_admission.test.sql',
		anchor: 'concurrent inline duplicate did not produce one session/turn/message winner'
	},
	{
		id: 'terminal_cancel_first',
		requirement: 'Cancellation wins when it commits before completion.',
		file: 'supabase/tests/20260802030500_agentic_chat_worker_terminal_control.test.sql',
		anchor: 'cancel-first race allowed competing completion truth'
	},
	{
		id: 'terminal_completion_first',
		requirement: 'Completion wins when it commits before cancellation.',
		file: 'supabase/tests/20260802030500_agentic_chat_worker_terminal_control.test.sql',
		anchor: 'completion-first race did not preserve one immutable winner'
	},
	{
		id: 'supersede_abort_honored',
		requirement: 'Supersede replaces the active worker turn with a distinct client turn id.',
		file: 'apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts',
		anchor: 'supersedes an active turn before sending a second message'
	},
	{
		id: 'supersede_abort_ignored',
		requirement: 'Supersede remains serialized when the provider ignores abort.',
		file: 'supabase/tests/20260803001000_agentic_chat_worker_phase2d_behavior_matrix.test.sql',
		anchor: 'provider_ignored_abort'
	},
	{
		id: 'supersede_terminal_delayed',
		requirement: 'Replacement waits for durable terminal truth after cancellation.',
		file: 'apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts',
		anchor: 'keeps a worker turn active until durable terminal truth follows cancellation'
	},
	{
		id: 'claim_two_worker_race',
		requirement: 'Two workers racing one job produce one generation owner.',
		file: 'supabase/tests/20260802020100_agentic_chat_worker_claim_fencing.test.sql',
		anchor: 'concurrent claim did not produce one generation winner'
	},
	{
		id: 'capacity_general_saturated',
		requirement: 'General queue saturation does not consume the chat slot.',
		file: 'apps/worker/tests/agenticChatConsumerFactory.test.ts',
		anchor: 'keeps saturated general slots independent from bounded chat slots'
	},
	{
		id: 'capacity_chat_saturated',
		requirement: 'Chat saturation does not consume general queue capacity.',
		file: 'apps/worker/tests/agenticChatConsumerFactory.test.ts',
		anchor: 'keeps saturated general slots independent from bounded chat slots'
	},
	{
		id: 'cancel_before_claim',
		requirement: 'A queued cancellation wins before the domain claim.',
		file: 'supabase/tests/20260802030500_agentic_chat_worker_terminal_control.test.sql',
		anchor: 'cancel-before-claim race started execution or left queue/domain truth split'
	},
	{
		id: 'cancel_during_model_stream',
		requirement: 'Cancellation during streaming commits the exact durable partial.',
		file: 'apps/worker/tests/agenticChatTurnExecutor.test.ts',
		anchor: 'finalizes exact durable partial text even when the provider ignores abort'
	},
	{
		id: 'cancel_before_mutation_commit',
		requirement: 'Cancellation before effect begin leaves the mutation uninvoked.',
		file: 'apps/worker/tests/agenticChatMutationExecutor.test.ts',
		anchor: 'closes a cancelled reservation before begin and never invokes the mutator'
	},
	{
		id: 'cancel_after_mutation_commit',
		requirement: 'A committed mutation receipt remains durable before cancellation.',
		file: 'apps/worker/tests/agenticChatTurnExecutor.test.ts',
		anchor: 'persists a committed mutation receipt before honoring post-begin cancellation'
	},
	{
		id: 'cancel_reserved_before_started',
		requirement: 'Reserved -> cancelled does not cross the irreversible boundary.',
		file: 'apps/worker/tests/agenticChatMutationExecutor.test.ts',
		anchor: 'closes a cancelled reservation before begin and never invokes the mutator'
	},
	{
		id: 'effect_provider_call_id_changed',
		requirement: 'Changed provider correlation still reuses the stable effect id.',
		file: 'apps/worker/tests/agenticChatMutationExecutor.test.ts',
		anchor: 'is stable across provider ids/generations and conflicts changed arguments'
	},
	{
		id: 'death_after_effect_reservation',
		requirement:
			'A new generation safely recovers a prior durable reservation by stable effect id.',
		file: 'supabase/tests/20260801041100_agentic_chat_worker_effect_rpcs.test.sql',
		anchor: 'current generation could not reconcile an effect reserved by the prior generation'
	},
	{
		id: 'death_after_downstream_commit',
		requirement: 'A lost response after downstream commit replays the existing receipt.',
		file: 'apps/worker/tests/agenticChatMutationExecutor.test.ts',
		anchor: 'replays an existing committed receipt without begin or reinvocation'
	},
	{
		id: 'death_before_effect_receipt',
		requirement: 'Ambiguous downstream completion remains uncertain and fail-closed.',
		file: 'apps/worker/tests/agenticChatMutationExecutor.test.ts',
		anchor: 'keeps an earlier ambiguous attempt uncertain when recovery fails closed'
	},
	{
		id: 'browser_realtime_disconnect',
		requirement: 'Browser channel loss and rejoin force durable convergence.',
		file: 'apps/web/src/lib/services/agentic-chat-v2/worker-realtime-channel.test.ts',
		anchor: 'forces durable convergence across channel loss and rejoin'
	},
	{
		id: 'broadcast_missed',
		requirement: 'Broadcast failure switches to reconciliation without losing persistence.',
		file: 'apps/worker/tests/agenticChatStreamPublisher.test.ts',
		anchor: 'suppresses later live events after Broadcast failure and emits only a reconcile hint'
	},
	{
		id: 'broadcast_duplicated',
		requirement: 'Duplicate live events are applied once.',
		file: 'apps/web/src/lib/services/agentic-chat-v2/worker-realtime-inbox.test.ts',
		anchor: 'applies contiguous events once and ignores duplicates and stale generations'
	},
	{
		id: 'sequence_gap_snapshot_reset',
		requirement: 'A retained event gap can be covered by the authoritative snapshot.',
		file: 'apps/web/src/lib/services/agentic-chat-v2/worker-realtime-inbox.test.ts',
		anchor: 'accepts retained-event gaps covered by the reconciliation snapshot'
	},
	{
		id: 'reconcile_live_generation_race',
		requirement: 'Future-generation live events wait for reconciliation adoption.',
		file: 'apps/web/src/lib/services/agentic-chat-v2/worker-realtime-inbox.test.ts',
		anchor: 'buffers a future generation until reconciliation adopts it'
	},
	{
		id: 'publisher_per_turn_high_water',
		requirement: 'Per-turn publisher pressure relieves and hard-bounds memory.',
		file: 'apps/worker/tests/agenticChatStreamPublisher.test.ts',
		anchor: 'provides pressure relief and fails closed with the complete prefix at the hard bound'
	},
	{
		id: 'publisher_global_high_water',
		requirement: 'The 100-turn worker-level fixture stays within global bounds.',
		file: 'apps/worker/tests/agenticChatFixtureLoad.test.ts',
		anchor: 'uses one cancel observation and bounded worker-level text flushes'
	},
	{
		id: 'publisher_unpausable_hard_bound',
		requirement: 'An unbounded provider becomes a typed failed terminal partial.',
		file: 'apps/worker/tests/agenticChatTurnExecutor.test.ts',
		anchor: 'turns publisher hard-bound overload into a failed terminal partial without retry'
	},
	{
		id: 'cancel_poll_mixed_generations',
		requirement: 'Cancel polling ignores stale/malformed/duplicate generations.',
		file: 'apps/worker/tests/agenticChatCancellationObserver.test.ts',
		anchor: 'ignores unknown, stale-generation, malformed, and duplicate response rows'
	},
	{
		id: 'cancel_poll_failed_interval',
		requirement: 'A failed cancel interval retries without a false abort.',
		file: 'apps/worker/tests/agenticChatCancellationObserver.test.ts',
		anchor: 'retries after a failed interval without aborting the registered turn'
	},
	{
		id: 'transport_flag_changed',
		requirement: 'Lost admission resolution adopts the prior stored transport decision.',
		file: 'apps/web/src/lib/services/agentic-chat-v2/transport-decision.test.ts',
		anchor: 'resolves the prior owned decision before client-turn fallback'
	},
	{
		id: 'transport_kill_epoch',
		requirement: 'Emergency epoch invalidates every outstanding lease and forces re-admission.',
		file: 'apps/web/src/lib/services/agentic-chat-v2/transport-lease.test.ts',
		anchor: 'invalidates every lease across an emergency kill epoch'
	},
	{
		id: 'transport_lost_admission_response',
		requirement: 'Uncertain worker admission keeps the bubble and recovers from server truth.',
		file: 'apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts',
		anchor: 'keeps the optimistic bubble after worker admission becomes uncertain'
	},
	{
		id: 'first_turn_concurrent_session',
		requirement: 'Concurrent first-turn admission creates exactly one session.',
		file: 'supabase/tests/20260802020000_agentic_chat_worker_atomic_admission.test.sql',
		anchor: 'concurrent inline duplicate did not produce one session/turn/message winner'
	},
	{
		id: 'channel_down_polling_readiness',
		requirement: 'Persistent Realtime outage converges through authenticated polling.',
		file: 'apps/web/src/lib/services/agentic-chat-v2/worker-realtime-coordinator.test.ts',
		anchor: 'keeps polling through a persistent Realtime outage and converges to terminal truth'
	},
	{
		id: 'forged_direct_queue_job',
		requirement: 'Authenticated/definer direct chat queue admission is rejected.',
		file: 'supabase/tests/20260801030600_agentic_chat_worker_queue_function_lockdown.test.sql',
		anchor: 'definer_agentic_add_is_rejected'
	},
	{
		id: 'auth_token_refreshed',
		requirement: 'Mounted Realtime follows token refresh without duplicating channels.',
		file: 'apps/web/src/lib/services/agentic-chat-v2/worker-realtime-runtime.test.ts',
		anchor: 'mounts one authenticated user channel and follows auth identity changes'
	},
	{
		id: 'auth_expired_not_ready',
		requirement: 'Reconciliation stays paused until authenticated identity exists.',
		file: 'apps/web/src/lib/services/agentic-chat-v2/worker-realtime-runtime.test.ts',
		anchor: 'keeps reconciliation paused until an authenticated user is established'
	},
	{
		id: 'reload_active_turn_adoption',
		requirement: 'Reload discovers and adopts the durable active worker handle.',
		file: 'apps/web/src/lib/services/agentic-chat-v2/worker-phase2d-composed-flow.test.ts',
		anchor: 'converges duplicate admission, reload discovery, reconnect, a sequence gap, and terminal wait'
	},
	{
		id: 'kill_epoch_forced_readmission',
		requirement:
			'A mid-turn kill-epoch bump re-admits the turn once on the worker, and a second demand fails instead of looping.',
		file: 'apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts',
		anchor: 're-admits the turn once on the worker after a mid-turn kill-epoch bump'
	},
	{
		id: 'kill_epoch_readmission_bounded',
		requirement: 'Repeated renegotiation demands surface an error rather than a retry loop.',
		file: 'apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts',
		anchor: 'fails the turn instead of looping when a second renegotiation is demanded'
	},
	{
		id: 'termination_before_provider',
		requirement: 'Denied/lost provider-start authority never invokes the provider.',
		file: 'apps/worker/tests/agenticChatTurnExecutor.test.ts',
		anchor: 'releases a prepared provider without streaming when the start fence denies invocation'
	},
	{
		id: 'termination_after_read_tool',
		requirement: 'A committed read ledger row remains recoverable if publication fails.',
		file: 'apps/worker/tests/agenticChatTurnExecutor.test.ts',
		anchor: 'carries an acknowledged tool row into recovery when public result persistence fails'
	},
	{
		id: 'termination_after_uncertain_mutation',
		requirement: 'Uncertain mutation recovery stops at the effect boundary.',
		file: 'apps/worker/tests/agenticChatTurnExecutor.test.ts',
		anchor: 'stops at effect reconciliation when a non-queryable mutation outcome is uncertain'
	},
	{
		id: 'timeout_provider_ignores_abort',
		requirement: 'A never-resolving provider is terminalized inside the executor budget.',
		file: 'apps/worker/tests/agenticChatTurnExecutor.test.ts',
		anchor: 'terminalizes a never-resolving provider stream inside the executor budget'
	},
	{
		id: 'stale_worker_event_publication',
		requirement: 'A stale generation cannot publish provider output.',
		file: 'apps/worker/tests/agenticChatTurnExecutor.test.ts',
		anchor: 'cannot publish or finalize after the start fence reports a stale generation'
	},
	{
		id: 'stale_worker_finalization',
		requirement: 'Stalled recovery stops when another generation owns the turn.',
		file: 'apps/worker/tests/agenticChatStalledRecovery.test.ts',
		anchor: 'stops immediately when recovery reports that the generation is stale'
	},
	{
		id: 'generic_stalled_post_start',
		requirement: 'Post-start transient failures cannot enter generic whole-turn retry.',
		file: 'supabase/tests/20260802031000_agentic_chat_worker_execution_recovery.test.sql',
		anchor: 'post-start transient failure was requeued'
	},
	{
		id: 'prepared_cleanup_active_turn',
		requirement: 'Prepared cache cleanup leaves the active frozen input executable.',
		file: 'supabase/tests/20260803001000_agentic_chat_worker_phase2d_behavior_matrix.test.sql',
		anchor: 'prepared cleanup made the retained turn non-executable'
	},
	{
		id: 'prepared_direct_mutation_lockdown',
		requirement: 'Authenticated callers cannot read or mutate prepared prompt content.',
		file: 'supabase/tests/20260801010000_agentic_chat_worker_phase2a_trust_foundation.test.sql',
		anchor: 'authenticated role retains prepared-prompt content access'
	},
	{
		id: 'source_history_edit_delete',
		requirement: 'Source history edits/deletes cannot change the frozen retry input.',
		file: 'supabase/tests/20260803001000_agentic_chat_worker_phase2d_behavior_matrix.test.sql',
		anchor: 'retry generation did not reuse the immutable admitted history after source deletion'
	},
	{
		id: 'terminal_broadcast_missing',
		requirement: 'Terminal Broadcast retries are bounded after durable commit.',
		file: 'apps/worker/tests/agenticChatStreamPublisher.test.ts',
		anchor: 'bounds terminal Broadcast retries after terminal truth commits'
	},
	{
		id: 'queue_completion_rpc_failed',
		requirement: 'Committed domain completion survives queue acknowledgement failure.',
		file: 'apps/worker/tests/agenticChatTurnExecutor.test.ts',
		anchor: 'keeps committed completion truth when queue completion cannot be acknowledged'
	},
	{
		id: 'terminal_client_stale_partial',
		requirement: 'Authoritative terminal snapshot replaces stale client text.',
		file: 'apps/web/src/lib/components/agent/agent-chat-worker-ui-adapter.test.ts',
		anchor: 'applies authoritative text before semantic projection and skips reconciled text deltas'
	},
	{
		id: 'retention_active_and_fresh_protected',
		requirement: 'Retention cleanup cannot remove active or fresh-terminal artifacts.',
		file: 'supabase/tests/20260820010000_agentic_chat_worker_retention_cleanup.test.sql',
		anchor: 'cleanup touched fresh-terminal or active-turn artifacts'
	},
	{
		id: 'retention_uncertain_effect_protected',
		requirement: 'Unresolved uncertain effects survive cleanup past ordinary retention.',
		file: 'supabase/tests/20260820010000_agentic_chat_worker_retention_cleanup.test.sql',
		anchor: 'cleanup deleted unresolved uncertainty or retained elapsed resolved effects'
	},
	{
		id: 'retention_service_boundary',
		requirement: 'Only service role can invoke worker artifact cleanup.',
		file: 'supabase/tests/20260820010000_agentic_chat_worker_retention_cleanup.test.sql',
		anchor: 'cleanup RPC privilege boundary is not service-only'
	}
]);

describe('Agentic Chat Phase 5 failure-injection evidence', () => {
	it('keeps a unique executable evidence anchor for the complete matrix', () => {
		expect(PHASE_5_FAILURE_EVIDENCE.length).toBeGreaterThanOrEqual(50);
		expect(new Set(PHASE_5_FAILURE_EVIDENCE.map(({ id }) => id)).size).toBe(
			PHASE_5_FAILURE_EVIDENCE.length
		);

		for (const evidence of PHASE_5_FAILURE_EVIDENCE) {
			const absolutePath = resolve(REPOSITORY_ROOT, evidence.file);
			expect(existsSync(absolutePath), `${evidence.id}: missing ${evidence.file}`).toBe(true);
			const source = readFileSync(absolutePath, 'utf8');
			expect(
				source.includes(evidence.anchor),
				`${evidence.id}: evidence anchor drifted from ${evidence.file}`
			).toBe(true);
			expect(
				evidence.requirement.length,
				`${evidence.id}: empty requirement`
			).toBeGreaterThan(20);
		}
	});
});
