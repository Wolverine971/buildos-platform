// apps/web/src/lib/server/gmail-relevance/scan-state.test.ts
import { describe, expect, it } from 'vitest';
import {
	EMAIL_RELEVANCE_SCAN_CONNECTION_TERMINAL_STATES,
	EMAIL_RELEVANCE_SCAN_RUN_TERMINAL_STATES,
	canTransitionEmailRelevanceScanConnection,
	canTransitionEmailRelevanceScanRun,
	deriveEmailRelevanceScanRunState,
	nextEmailRelevanceScanFailureState
} from './scan-state';

describe('email relevance scan state machine', () => {
	it('allows pause/resume and lease recovery while keeping terminal states immutable', () => {
		expect(canTransitionEmailRelevanceScanRun('running', 'paused')).toBe(true);
		expect(canTransitionEmailRelevanceScanRun('paused', 'running')).toBe(true);
		expect(canTransitionEmailRelevanceScanConnection('leased', 'pending')).toBe(true);
		expect(canTransitionEmailRelevanceScanConnection('retry_wait', 'leased')).toBe(true);

		for (const state of EMAIL_RELEVANCE_SCAN_RUN_TERMINAL_STATES) {
			expect(canTransitionEmailRelevanceScanRun(state, 'running')).toBe(false);
		}
		for (const state of EMAIL_RELEVANCE_SCAN_CONNECTION_TERMINAL_STATES) {
			expect(canTransitionEmailRelevanceScanConnection(state, 'leased')).toBe(false);
		}
	});

	it('derives completed and partial outcomes from three independent scopes', () => {
		expect(
			deriveEmailRelevanceScanRunState({
				current_state: 'running',
				connection_states: ['completed', 'completed', 'completed'],
				pause_requested: false,
				cancel_requested: false,
				manifest_expired: false
			})
		).toBe('completed');
		expect(
			deriveEmailRelevanceScanRunState({
				current_state: 'running',
				connection_states: ['completed', 'quota_stopped', 'failed'],
				pause_requested: false,
				cancel_requested: false,
				manifest_expired: false
			})
		).toBe('partial');
	});

	it('derives cancellation, expiration, quota stop, and failure without caller-selected results', () => {
		const base = {
			current_state: 'running' as const,
			pause_requested: false,
			cancel_requested: false,
			manifest_expired: false
		};
		expect(
			deriveEmailRelevanceScanRunState({
				...base,
				cancel_requested: true,
				connection_states: ['cancelled', 'cancelled', 'cancelled']
			})
		).toBe('cancelled');
		expect(
			deriveEmailRelevanceScanRunState({
				...base,
				manifest_expired: true,
				connection_states: ['expired', 'expired', 'expired']
			})
		).toBe('expired');
		expect(
			deriveEmailRelevanceScanRunState({
				...base,
				connection_states: ['quota_stopped', 'cancelled', 'quota_stopped']
			})
		).toBe('quota_stopped');
		expect(
			deriveEmailRelevanceScanRunState({
				...base,
				connection_states: ['failed', 'cancelled', 'failed']
			})
		).toBe('failed');
	});

	it('makes pause durable without changing checkpoints and bounds retries', () => {
		expect(
			deriveEmailRelevanceScanRunState({
				current_state: 'running',
				connection_states: ['pending', 'leased', 'retry_wait'],
				pause_requested: true,
				cancel_requested: false,
				manifest_expired: false
			})
		).toBe('paused');
		expect(
			nextEmailRelevanceScanFailureState({
				error_code: 'synthetic_retryable',
				attempt: 2,
				max_attempts: 3
			})
		).toBe('retry_wait');
		expect(
			nextEmailRelevanceScanFailureState({
				error_code: 'synthetic_retryable',
				attempt: 3,
				max_attempts: 3
			})
		).toBe('failed');
		expect(
			nextEmailRelevanceScanFailureState({
				error_code: 'stale_checkpoint',
				attempt: 1,
				max_attempts: 3
			})
		).toBe('no_op');
		expect(
			nextEmailRelevanceScanFailureState({
				error_code: 'lease_expired',
				attempt: 1,
				max_attempts: 3
			})
		).toBe('pending');
	});
});
