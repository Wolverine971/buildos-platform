// apps/worker/src/workers/agent-run/agentRunAccounting.ts
import type { executeAgentOp } from '@buildos/shared-agent-ops';
import { AGENT_OP_WEB_SEARCH } from '@buildos/shared-agent-ops';
import { LLMUsageLogger } from '@buildos/smart-llm';
import type {
	JSONSpendReservationEvent,
	JSONUsageEvent
} from '../../lib/services/smart-llm-service';
import { supabase } from '../../lib/supabase';
import type { AgentRunRow } from './agentRunLifecycle';
import { emitEvent } from './agentRunJournal';
import { classifyAgentRunTokenUsage } from './agentRunRuntimePolicy';
import {
	canReservePaidToolCost,
	resolveAgentRunLlmLedgerSettlement,
	settlePaidToolReservation
} from './agentRunCostPolicy';
import {
	AgentRunCostLedgerError,
	reserveAgentRunCost,
	settleAgentRunCost
} from './agentRunCostLedger';
import { type PaidToolCharge, readPaidToolCharge } from './webResearchPort';

// The ledger enforces spend; usage logs also feed the admin cost dashboards.
const paidToolUsageLogger = new LLMUsageLogger({ supabase });

/** Per-execution accounting shared by model and web calls, including retry totals. */
export function createAgentRunAccounting(params: {
	run: AgentRunRow;
	jobId: string;
	maxCostUsd?: number;
	assertOwnership: () => Promise<void>;
}) {
	const { run, jobId, maxCostUsd, assertOwnership } = params;
	const runId = run.id;
	const totals = {
		tokens: 0,
		cost: 0,
		llmCost: 0,
		paidToolCost: 0,
		tavilyCredits: 0,
		uncertainTokenExposure: 0
	};
	const paidToolDispatches: Array<{ attemptKey: string; charge: PaidToolCharge }> = [];
	let activePaidToolAttemptKey: string | null = null;
	let paidToolAccountingFailure: AgentRunCostLedgerError | null = null;
	const addLlmUsage = (
		usage: Pick<
			JSONUsageEvent,
			'totalTokens' | 'totalCost' | 'costSource' | 'billingDisposition'
		>
	) => {
		const tokenCharge = classifyAgentRunTokenUsage(usage);
		totals.tokens += tokenCharge.observedTokens;
		totals.uncertainTokenExposure += tokenCharge.uncertainTokenExposure;
		if (usage.totalCost) {
			totals.cost += usage.totalCost;
			totals.llmCost += usage.totalCost;
		}
	};

	const createLlmAccountingHooks = (attemptKey: string, operation: string) => ({
		onSpendReservation: async (reservation: JSONSpendReservationEvent) => {
			await assertOwnership();
			const entry = await reserveAgentRunCost({
				leafRunId: runId,
				attemptKey,
				provider: reservation.provider,
				operation,
				resource: reservation.model,
				reservedCostUsd: reservation.reservedCostUsd,
				reservedUnits: reservation.estimatedInputTokens + reservation.maxTokens,
				unitType: 'tokens',
				metadata: {
					job_id: jobId,
					model: reservation.model,
					estimated_input_tokens: reservation.estimatedInputTokens,
					max_output_tokens: reservation.maxTokens,
					provider_max_price: reservation.providerMaxPrice
				},
				requireNewAttempt: true
			});
			await emitEvent(runId, 'run.cost', {
				phase: 'reserved',
				ledger_entry_id: entry.id,
				attempt_key: attemptKey,
				provider: entry.provider,
				operation,
				cost_usd: entry.reserved_cost_usd
			});
		},
		onUsage: async (usage: JSONUsageEvent) => {
			// Metrics retain the provider outcome even if settlement persistence
			// fails; the durable reservation remains conservative in that case.
			addLlmUsage(usage);
			const settlement = resolveAgentRunLlmLedgerSettlement(usage);
			const entry = await settleAgentRunCost({
				leafRunId: runId,
				attemptKey,
				status: settlement.status,
				actualCostUsd: settlement.actualCostUsd,
				actualUnits: settlement.actualUnits,
				providerRequestId: usage.providerRequestId,
				metadata: {
					cost_source: usage.costSource,
					actual_provider: usage.provider ?? null,
					billing_provider: usage.billingProvider ?? null,
					actual_model: usage.model,
					billing_disposition: usage.billingDisposition ?? null
				}
			});
			await emitEvent(runId, 'run.cost', {
				phase: entry.status,
				ledger_entry_id: entry.id,
				attempt_key: attemptKey,
				provider: entry.provider,
				operation,
				reserved_cost_usd: entry.reserved_cost_usd,
				actual_cost_usd: entry.actual_cost_usd,
				cost_source: usage.costSource
			});
		}
	});
	const onSearchDispatched = async (charge: PaidToolCharge) => {
		await assertOwnership();
		if (!activePaidToolAttemptKey) {
			throw new AgentRunCostLedgerError(
				'Tavily dispatch has no active cost attempt key.',
				'rpc_error'
			);
		}
		if (
			!canReservePaidToolCost({
				maxCostUsd,
				currentCostUsd: totals.cost,
				reservationCostUsd: charge.cost_usd
			})
		) {
			throw new AgentRunCostLedgerError(
				'Tavily dispatch exceeds the remaining Agent Run cost budget.',
				'budget_exceeded'
			);
		}
		try {
			const entry = await reserveAgentRunCost({
				leafRunId: runId,
				attemptKey: activePaidToolAttemptKey,
				provider: charge.provider,
				operation: AGENT_OP_WEB_SEARCH,
				resource: charge.credits === 1 ? 'basic' : 'advanced',
				reservedCostUsd: charge.cost_usd,
				reservedUnits: charge.credits,
				unitType: 'credits',
				metadata: {
					job_id: jobId,
					unit_cost_usd: charge.unit_cost_usd,
					source: charge.source
				},
				requireNewAttempt: true
			});
			paidToolDispatches.push({
				attemptKey: activePaidToolAttemptKey,
				charge
			});
			totals.cost += charge.cost_usd;
			totals.paidToolCost += charge.cost_usd;
			totals.tavilyCredits += charge.credits;
			await emitEvent(runId, 'run.cost', {
				phase: 'reserved',
				ledger_entry_id: entry.id,
				attempt_key: activePaidToolAttemptKey,
				provider: charge.provider,
				credits: charge.credits,
				cost_usd: charge.cost_usd,
				source: charge.source
			});
		} catch (error) {
			paidToolAccountingFailure =
				error instanceof AgentRunCostLedgerError
					? error
					: new AgentRunCostLedgerError(
							error instanceof Error ? error.message : String(error),
							'rpc_error'
						);
			throw paidToolAccountingFailure;
		}
	};

	const finishTool = async (
		opStart: number,
		result: Awaited<ReturnType<typeof executeAgentOp>>
	) => {
		const durationMs = Date.now() - opStart;
		const dispatchedPaidTool = paidToolDispatches.at(-1);
		if (dispatchedPaidTool) {
			// The dispatch hook already charged the reservation immediately before
			// network I/O. Settle to provider-reported credits on success; retain the
			// reservation when the response/usage is unavailable.
			const settlement = settlePaidToolReservation(
				dispatchedPaidTool.charge,
				(result.ok && readPaidToolCharge(result.data)) || null
			);
			totals.cost += settlement.costAdjustmentUsd;
			totals.paidToolCost += settlement.costAdjustmentUsd;
			totals.tavilyCredits += settlement.creditAdjustment;
			const ledgerStatus =
				result.ok && settlement.charge.source === 'provider_reported'
					? 'settled'
					: 'reconciliation_required';
			try {
				const entry = await settleAgentRunCost({
					leafRunId: runId,
					attemptKey: dispatchedPaidTool.attemptKey,
					status: ledgerStatus,
					actualCostUsd: result.ok ? settlement.charge.cost_usd : undefined,
					actualUnits: result.ok ? settlement.charge.credits : undefined,
					providerRequestId: settlement.charge.provider_request_id,
					metadata: {
						source: settlement.charge.source,
						tool_succeeded: result.ok
					}
				});
				await emitEvent(runId, 'run.cost', {
					phase: entry.status,
					ledger_entry_id: entry.id,
					attempt_key: dispatchedPaidTool.attemptKey,
					provider: settlement.charge.provider,
					credits: settlement.charge.credits,
					cost_usd: settlement.charge.cost_usd,
					source: settlement.charge.source,
					cost_adjustment_usd: settlement.costAdjustmentUsd
				});
			} catch (error) {
				paidToolAccountingFailure =
					error instanceof AgentRunCostLedgerError
						? error
						: new AgentRunCostLedgerError(
								error instanceof Error ? error.message : String(error),
								'rpc_error'
							);
			}
			try {
				const tavilyResource = settlement.charge.credits === 1 ? 'basic' : 'advanced';
				await paidToolUsageLogger.logUsageToDatabase({
					userId: run.user_id,
					operationType: 'agent_run_web_search',
					modelRequested: `tavily/search-${tavilyResource}`,
					modelUsed: `tavily/search-${tavilyResource}`,
					provider: 'tavily',
					promptTokens: 0,
					completionTokens: 0,
					totalTokens: 0,
					inputCost: 0,
					outputCost: 0,
					totalCost: settlement.charge.cost_usd,
					responseTimeMs: durationMs,
					requestStartedAt: new Date(opStart),
					requestCompletedAt: new Date(opStart + durationMs),
					status: result.ok ? 'success' : 'failure',
					metadata: {
						agent_run_id: runId,
						attempt_key: dispatchedPaidTool.attemptKey,
						tavily_credits: settlement.charge.credits,
						provider_request_id: settlement.charge.provider_request_id ?? null,
						charge_source: settlement.charge.source,
						project_id: run.project_id ?? null
					}
				});
			} catch (error) {
				console.warn(
					'[agentRunWorker] failed to log web-search usage row:',
					error instanceof Error ? error.message : error
				);
			}
		}
	};
	return {
		totals,
		createLlmAccountingHooks,
		onSearchDispatched,
		beginTool(attemptKey: string | null) {
			paidToolDispatches.length = 0;
			paidToolAccountingFailure = null;
			activePaidToolAttemptKey = attemptKey;
		},
		endToolDispatch() {
			activePaidToolAttemptKey = null;
		},
		finishTool,
		get failure() {
			return paidToolAccountingFailure;
		}
	};
}
