// apps/web/src/lib/services/agentic-chat/tools/core/executors/external-executor.ts
/**
 * External Executor
 *
 * Handles external service tool operations:
 * - web_search: Web search via Tavily API
 * - get_buildos_overview: BuildOS documentation overview
 * - get_buildos_usage_guide: BuildOS usage guide
 */

import { BaseExecutor } from './base-executor';
import {
	getBuildosOverviewDocument,
	getBuildosUsageGuide
} from '$lib/services/agentic-chat/tools/buildos';
import { performWebSearch, type WebSearchArgs } from '$lib/services/agentic-chat/tools/websearch';
import type { ExecutorContext } from './types';

/**
 * Executor for external service tool operations.
 *
 * Provides web search and BuildOS documentation access.
 */
export class ExternalExecutor extends BaseExecutor {
	constructor(context: ExecutorContext) {
		super(context);
	}

	// ============================================
	// WEB SEARCH
	// ============================================

	/**
	 * Perform a web search using Tavily API.
	 */
	async webSearch(args: WebSearchArgs): Promise<any> {
		return performWebSearch(args, this.fetchFn);
	}

	// ============================================
	// BUILDOS DOCS
	// ============================================

	/**
	 * Get BuildOS overview documentation.
	 */
	getBuildosOverview(): any {
		return getBuildosOverviewDocument();
	}

	/**
	 * Get BuildOS usage guide documentation.
	 */
	getBuildosUsageGuide(): any {
		return getBuildosUsageGuide();
	}
}
