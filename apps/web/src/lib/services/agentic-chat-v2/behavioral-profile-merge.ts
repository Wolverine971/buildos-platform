// apps/web/src/lib/services/agentic-chat-v2/behavioral-profile-merge.ts

export type BehavioralProfileMode = 'off' | 'shadow' | 'inject';

const MAX_INSTRUCTION_CHARS = 1200;

export function parseBehavioralProfileMode(
	rawValue: string | undefined | null
): BehavioralProfileMode {
	const normalized = String(rawValue ?? '')
		.trim()
		.toLowerCase();

	if (normalized === 'shadow') return 'shadow';
	if (normalized === 'inject') return 'inject';
	return 'off';
}

export function clampBehavioralInstruction(
	instruction: string | null | undefined,
	maxChars = MAX_INSTRUCTION_CHARS
): string {
	if (!instruction) return '';
	const normalized = instruction.trim();
	if (!normalized) return '';
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, maxChars).trimEnd()}...`;
}

export function mergeBehavioralInstructions(params: {
	globalInstruction?: string;
	projectInstruction?: string;
	projectConfidence?: number | null;
}): string {
	const globalInstruction = clampBehavioralInstruction(params.globalInstruction);
	const projectInstruction = clampBehavioralInstruction(params.projectInstruction);

	if (!globalInstruction && !projectInstruction) {
		return '';
	}

	if (!projectInstruction) {
		return `Behavioral profile (global):\n${globalInstruction}`;
	}

	if (!globalInstruction) {
		return `Behavioral profile (project):\n${projectInstruction}`;
	}

	const projectConfidence = params.projectConfidence ?? 0;

	if (projectConfidence >= 0.55) {
		return [
			`Behavioral profile (project-priority, confidence=${projectConfidence.toFixed(2)}):`,
			projectInstruction,
			'',
			'Behavioral profile (global baseline):',
			globalInstruction
		].join('\n');
	}

	return [
		`Behavioral profile (global baseline):`,
		globalInstruction,
		'',
		`Behavioral profile (project signals, low confidence=${projectConfidence.toFixed(2)}):`,
		projectInstruction
	].join('\n');
}
