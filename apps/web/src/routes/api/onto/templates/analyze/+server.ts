// apps/web/src/routes/api/onto/templates/analyze/+server.ts
/**
 * POST /api/onto/templates/analyze
 * Uses LLM to classify a brain dump into domain/deliverable/variant suggestions.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { TemplateAnalyzerService } from '$lib/services/ontology/template-analyzer.service';
import { SmartLLMService } from '$lib/services/smart-llm-service';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		if (!user.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		const body = await request.json();
		const scope = typeof body.scope === 'string' ? body.scope : '';
		const realm = typeof body.realm === 'string' && body.realm.length > 0 ? body.realm : null;
		const domain = typeof body.domain === 'string' ? body.domain : null;
		const rawTargetLevel = body.target_level;
		const targetLevel =
			rawTargetLevel === 'realm' ||
			rawTargetLevel === 'domain' ||
			rawTargetLevel === 'deliverable'
				? rawTargetLevel
				: null;
		const brainDump = typeof body.brain_dump === 'string' ? body.brain_dump.trim() : '';
		const rejectedSuggestions = Boolean(body.rejected_suggestions);
		const priorSuggestions = Array.isArray(body.prior_suggestions)
			? (body.prior_suggestions as string[]).map((key) => String(key))
			: [];

		if (!scope || (!realm && targetLevel !== 'realm') || !brainDump) {
			return ApiResponse.badRequest(
				'Missing required fields: scope and brain_dump are required (realm required unless creating a new realm)'
			);
		}

		const llmService = new SmartLLMService({
			httpReferer: 'https://buildos.dev',
			appName: 'BuildOS Template Analyzer',
			supabase: locals.supabase
		});

		const analyzer = new TemplateAnalyzerService(locals.supabase, llmService);

		const result = await analyzer.analyze({
			scope,
			realm,
			domain,
			brainDump,
			userId: user.id,
			targetLevel,
			rejectedSuggestions,
			priorSuggestions
		});

		return ApiResponse.success(result);
	} catch (err) {
		console.error('[Ontology] template analyzer failed:', err);
		return ApiResponse.internalError(err, 'Failed to analyze template idea');
	}
};
