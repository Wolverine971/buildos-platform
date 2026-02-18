// apps/web/src/lib/server/billing-ops-monitoring.test.ts
import { describe, expect, it } from 'vitest';
import {
	detectBillingOpsAnomalies,
	type BillingOpsBaseline,
	type BillingOpsSnapshotRecord
} from './billing-ops-monitoring';

const CURRENT_BASE: BillingOpsSnapshotRecord = {
	snapshotDate: '2026-02-18',
	windowDays: 30,
	frozenActiveCount: 12,
	totalAccountsCount: 220,
	freezeTransitionsWindowCount: 18,
	manualUnfreezeWindowCount: 4,
	proToPowerTransitionWindowCount: 10,
	autoProToPowerTransitionWindowCount: 8,
	paidAccountCount: 120,
	currentPowerAccountCount: 22,
	manualUnfreezeRate: 0.22,
	autoProToPowerEscalationRate: 0.066,
	currentPowerShare: 0.183,
	frozenAccountShare: 0.054
};

describe('billing ops anomaly detection', () => {
	it('detects spikes against a baseline', () => {
		const currentSpike: BillingOpsSnapshotRecord = {
			...CURRENT_BASE,
			frozenActiveCount: 22,
			freezeTransitionsWindowCount: 20,
			manualUnfreezeRate: 0.31,
			autoProToPowerEscalationRate: 0.17
		};

		const baseline: BillingOpsBaseline = {
			sampleSize: 7,
			averages: {
				frozenActiveCount: 5,
				totalAccountsCount: 210,
				freezeTransitionsWindowCount: 6,
				manualUnfreezeWindowCount: 1,
				proToPowerTransitionWindowCount: 6,
				autoProToPowerTransitionWindowCount: 4,
				paidAccountCount: 110,
				currentPowerAccountCount: 18,
				manualUnfreezeRate: 0.09,
				autoProToPowerEscalationRate: 0.03,
				currentPowerShare: 0.16,
				frozenAccountShare: 0.024
			}
		};

		const anomalies = detectBillingOpsAnomalies(currentSpike, baseline);
		expect(anomalies.length).toBeGreaterThanOrEqual(3);
		expect(anomalies.some((entry) => entry.anomalyKey === 'frozen_volume_spike')).toBe(true);
		expect(anomalies.some((entry) => entry.anomalyKey === 'freeze_transition_spike')).toBe(
			true
		);
		expect(anomalies.some((entry) => entry.anomalyKey === 'manual_unfreeze_rate_spike')).toBe(
			true
		);
	});

	it('does not flag anomalies for stable values', () => {
		const baseline: BillingOpsBaseline = {
			sampleSize: 10,
			averages: {
				frozenActiveCount: 11,
				totalAccountsCount: 220,
				freezeTransitionsWindowCount: 16,
				manualUnfreezeWindowCount: 3,
				proToPowerTransitionWindowCount: 9,
				autoProToPowerTransitionWindowCount: 8,
				paidAccountCount: 120,
				currentPowerAccountCount: 21,
				manualUnfreezeRate: 0.2,
				autoProToPowerEscalationRate: 0.06,
				currentPowerShare: 0.175,
				frozenAccountShare: 0.05
			}
		};

		const anomalies = detectBillingOpsAnomalies(CURRENT_BASE, baseline);
		expect(anomalies).toHaveLength(0);
	});

	it('uses absolute thresholds when baseline is missing', () => {
		const anomalies = detectBillingOpsAnomalies(
			{
				...CURRENT_BASE,
				frozenActiveCount: 34,
				manualUnfreezeRate: 0.45
			},
			null
		);

		expect(anomalies.some((entry) => entry.anomalyKey === 'frozen_volume_high_absolute')).toBe(
			true
		);
		expect(
			anomalies.some((entry) => entry.anomalyKey === 'manual_unfreeze_rate_high_absolute')
		).toBe(true);
	});
});
