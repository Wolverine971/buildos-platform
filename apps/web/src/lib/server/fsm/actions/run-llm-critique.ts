// apps/web/src/lib/server/fsm/actions/run-llm-critique.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { FSMAction } from '$lib/types/onto';
import { mergeDeep } from './utils';
import type { TransitionContext } from '../engine';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Json } from '@buildos/shared-types';

type EntityRow = {
	id: string;
	project_id: string;
	type_key: string;
	state_key: string;
	props: Record<string, unknown>;
};

type OutputRow = {
	id: string;
	name: string | null;
	state_key: string;
	type_key: string;
	project_id: string | null;
	props: Record<string, unknown> | null;
};

export type CritiqueChecklistItem = {
	label: string;
	status: 'pass' | 'warn' | 'info';
	detail: string;
};

export type CritiquePayload = {
	rubric_key: string;
	summary: string;
	checklist: CritiqueChecklistItem[];
	generated_at: string;
	actor_id: string | null;
	user_id: string | null;
};

export function buildCritiquePayload(
	output: OutputRow,
	opts: { rubricKey?: string; actorId?: string | null; userId?: string | null } = {}
): CritiquePayload {
	const rubricKey = opts.rubricKey ?? 'default';
	const title = output.name ?? 'Untitled Output';

	const checklist: CritiqueChecklistItem[] = [];

	checklist.push({
		label: 'State Review',
		status:
			output.state_key === 'published' || output.state_key === 'approved' ? 'pass' : 'warn',
		detail:
			output.state_key === 'published' || output.state_key === 'approved'
				? `Output is in "${output.state_key}" state.`
				: `Consider advancing the output from "${output.state_key}" before delivery.`
	});

	const props = (output.props ?? {}) as Record<string, unknown>;
	const wordCount =
		typeof props.word_count === 'number'
			? props.word_count
			: typeof props.target_word_count === 'number'
				? props.target_word_count
				: null;

	if (wordCount !== null) {
		checklist.push({
			label: 'Word Count',
			status: wordCount > 0 ? 'pass' : 'warn',
			detail:
				wordCount > 0
					? `Document length is ${wordCount.toLocaleString()} words.`
					: 'Word count is missing. Consider adding substantive content.'
		});
	}

	const content = typeof props.content === 'string' ? props.content : null;
	if (content) {
		const hasPlaceholders = /\b(TODO|lorem ipsum)\b/i.test(content);
		checklist.push({
			label: 'Content Quality',
			status: hasPlaceholders ? 'warn' : 'pass',
			detail: hasPlaceholders
				? 'Placeholder text detected (e.g., TODO or lorem ipsum). Replace with final copy.'
				: 'No obvious placeholder text detected.'
		});
	} else {
		checklist.push({
			label: 'Content Quality',
			status: 'warn',
			detail: 'No content detected in props. Ensure the document has been drafted.'
		});
	}

	const summary = `Automated critique for "${title}" using rubric "${rubricKey}". Review the checklist for actionable next steps.`;

	return {
		rubric_key: rubricKey,
		summary,
		checklist,
		generated_at: new Date().toISOString(),
		actor_id: opts.actorId ?? null,
		user_id: opts.userId ?? null
	};
}

export async function executeRunLlmCritiqueAction(
	action: FSMAction,
	entity: EntityRow,
	ctx: TransitionContext,
	clientParam?: TypedSupabaseClient
): Promise<string> {
	const outputId = action.output_id;
	if (!outputId) {
		throw new Error('run_llm_critique requires output_id');
	}

	const client = clientParam ?? createAdminSupabaseClient();

	const { data: output, error } = await client
		.from('onto_outputs')
		.select('id, name, state_key, type_key, project_id, props')
		.eq('id', outputId)
		.maybeSingle();

	if (error || !output) {
		throw new Error(`Output not found for run_llm_critique: ${outputId}`);
	}

	const critique = buildCritiquePayload(output as OutputRow, {
		rubricKey: action.rubric_key,
		actorId: ctx.actor_id ?? null,
		userId: ctx.user_id ?? null
	});

	const existingProps = (output.props ?? {}) as Record<string, unknown>;
	const existingCritiques = Array.isArray(existingProps.critiques)
		? (existingProps.critiques as CritiquePayload[])
		: [];

	const updatedProps = mergeDeep(existingProps, {
		critiques: [...existingCritiques, critique]
	});

	const { error: updateError } = await client
		.from('onto_outputs')
		.update({ props: updatedProps as Json })
		.eq('id', outputId);

	if (updateError) {
		throw new Error(`Failed to persist critique: ${updateError.message}`);
	}

	return `run_llm_critique(${outputId})`;
}
