// apps/web/src/lib/services/agentic-chat-v2/behavioral-profile-merge.test.ts
import { describe, expect, it } from 'vitest';
import {
	clampBehavioralInstruction,
	mergeBehavioralInstructions,
	parseBehavioralProfileMode
} from './behavioral-profile-merge';

describe('behavioral-profile-merge', () => {
	it('parses profile mode safely', () => {
		expect(parseBehavioralProfileMode(undefined)).toBe('off');
		expect(parseBehavioralProfileMode('shadow')).toBe('shadow');
		expect(parseBehavioralProfileMode('inject')).toBe('inject');
		expect(parseBehavioralProfileMode('unknown')).toBe('off');
	});

	it('clamps oversized instructions', () => {
		const text = 'x'.repeat(20);
		expect(clampBehavioralInstruction(text, 10)).toBe('xxxxxxxxxx...');
	});

	it('merges global and high-confidence project instructions with project priority', () => {
		const merged = mergeBehavioralInstructions({
			globalInstruction: 'Global guidance',
			projectInstruction: 'Project guidance',
			projectConfidence: 0.8
		});

		expect(merged).toContain('Behavioral profile (project-priority');
		expect(merged).toContain('Project guidance');
		expect(merged).toContain('Behavioral profile (global baseline)');
	});

	it('falls back to global-first merge for low-confidence project signals', () => {
		const merged = mergeBehavioralInstructions({
			globalInstruction: 'Global guidance',
			projectInstruction: 'Project guidance',
			projectConfidence: 0.2
		});

		expect(merged).toContain('Behavioral profile (global baseline)');
		expect(merged).toContain('low confidence=0.20');
	});
});
