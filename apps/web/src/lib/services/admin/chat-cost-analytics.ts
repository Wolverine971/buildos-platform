// apps/web/src/lib/services/admin/chat-cost-analytics.ts
type Attribution = 'exact' | 'inferred';

export type ChatCostUsageRow = {
	id: string;
	user_id?: string | null;
	chat_session_id?: string | null;
	turn_run_id?: string | null;
	stream_run_id?: string | null;
	client_turn_id?: string | null;
	operation_type?: string | null;
	model_used?: string | null;
	prompt_tokens?: number | string | null;
	completion_tokens?: number | string | null;
	total_tokens?: number | string | null;
	input_cost_usd?: number | string | null;
	output_cost_usd?: number | string | null;
	total_cost_usd?: number | string | null;
	request_started_at?: string | null;
	request_completed_at?: string | null;
	created_at?: string | null;
	metadata?: unknown;
};

export type ChatCostSessionRow = {
	id: string;
	user_id?: string | null;
	title?: string | null;
	auto_title?: string | null;
	summary?: string | null;
	context_type?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	last_message_at?: string | null;
	users?: { id?: string | null; email?: string | null; name?: string | null } | null;
};

export type ChatCostTurnRunRow = {
	id: string;
	session_id: string;
	user_id?: string | null;
	stream_run_id?: string | null;
	client_turn_id?: string | null;
	request_message?: string | null;
	status?: string | null;
	llm_pass_count?: number | string | null;
	tool_call_count?: number | string | null;
	history_strategy?: string | null;
	history_compressed?: boolean | null;
	raw_history_count?: number | string | null;
	history_for_model_count?: number | string | null;
	started_at?: string | null;
	finished_at?: string | null;
	created_at?: string | null;
};

export type ChatCostUserRow = {
	id: string;
	email?: string | null;
	name?: string | null;
};

type TurnLookup = {
	turn: ChatCostTurnRunRow;
	turnIndex: number;
	attribution: Attribution;
};

type SessionAggregate = {
	id: string;
	user_id: string | null;
	title: string;
	user_email: string;
	context_type: string;
	created_at: string | null;
	cost: number;
	input_cost: number;
	output_cost: number;
	prompt_tokens: number;
	completion_tokens: number;
	tokens: number;
	llm_calls: number;
	model_costs: Map<string, number>;
	turn_ids: Set<string>;
	max_turn_cost: number;
	max_turn_id: string | null;
	unattributed_cost: number;
};

type TurnAggregate = {
	id: string;
	turn_run_id: string;
	session_id: string;
	user_id: string | null;
	user_email: string;
	session_title: string;
	turn_index: number;
	request_message: string;
	started_at: string | null;
	finished_at: string | null;
	status: string;
	history_strategy: string | null;
	history_compressed: boolean | null;
	raw_history_count: number;
	history_for_model_count: number;
	llm_pass_count: number;
	tool_call_count: number;
	attribution: Attribution;
	cost: number;
	input_cost: number;
	output_cost: number;
	prompt_tokens: number;
	completion_tokens: number;
	tokens: number;
	llm_calls: number;
	model_costs: Map<string, number>;
};

type ModelAggregate = {
	model: string;
	requests: number;
	cost: number;
	attributed_cost: number;
	unattributed_cost: number;
	input_cost: number;
	output_cost: number;
	prompt_tokens: number;
	completion_tokens: number;
	tokens: number;
	turn_costs: Map<string, number>;
};

const DETAILS_BASE_URL = '/admin/chat/sessions?chat_session_id=';

const asNumber = (value: unknown): number => {
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const normalizeText = (value: string | null | undefined): string =>
	(value ?? '').replace(/\s+/g, ' ').trim();

const previewText = (value: string | null | undefined, maxChars = 180): string => {
	const normalized = normalizeText(value);
	if (!normalized) return '';
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
};

const safeDate = (value: string | null | undefined): string | null => value ?? null;

const dateMs = (value: string | null | undefined): number | null => {
	if (!value) return null;
	const ms = new Date(value).getTime();
	return Number.isFinite(ms) ? ms : null;
};

const percentile = (values: number[], p: number): number => {
	const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
	if (sorted.length === 0) return 0;
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
	);
	return sorted[index] ?? 0;
};

const average = (values: number[]): number =>
	values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const sessionTitle = (session: ChatCostSessionRow | undefined): string => {
	if (!session) return 'Unknown Chat';
	const explicit = normalizeText(session.title) || normalizeText(session.auto_title);
	if (explicit) return explicit;
	if (normalizeText(session.summary)) return previewText(session.summary, 120);
	const contextType = (session.context_type ?? 'global').replaceAll('_', ' ');
	return `Chat Session (${contextType})`;
};

const primaryModel = (modelCosts: Map<string, number>): string => {
	let selected = 'unknown';
	let selectedCost = -1;
	for (const [model, cost] of modelCosts.entries()) {
		if (cost > selectedCost) {
			selected = model;
			selectedCost = cost;
		}
	}
	return selected;
};

const metadataString = (metadata: unknown, key: string): string | null => {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
	const value = (metadata as Record<string, unknown>)[key];
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const sortTurns = (turns: ChatCostTurnRunRow[]): ChatCostTurnRunRow[] =>
	[...turns].sort((a, b) => {
		const left = a.started_at ?? a.created_at ?? '';
		const right = b.started_at ?? b.created_at ?? '';
		if (left !== right) return left < right ? -1 : 1;
		return a.id.localeCompare(b.id);
	});

const resolveUsageTurn = (params: {
	row: ChatCostUsageRow;
	turnById: Map<string, ChatCostTurnRunRow>;
	turnIndexById: Map<string, number>;
	turnByStreamRunId: Map<string, ChatCostTurnRunRow>;
	turnByClientTurnKey: Map<string, ChatCostTurnRunRow>;
	turnsBySession: Map<string, ChatCostTurnRunRow[]>;
}): TurnLookup | null => {
	const { row, turnById, turnIndexById, turnByStreamRunId, turnByClientTurnKey, turnsBySession } =
		params;
	const directTurnId = row.turn_run_id || metadataString(row.metadata, 'turnRunId');
	if (directTurnId) {
		const turn = turnById.get(directTurnId);
		const turnIndex = turn ? turnIndexById.get(turn.id) : null;
		if (turn && turnIndex) return { turn, turnIndex, attribution: 'exact' };
	}

	const streamRunId = row.stream_run_id || metadataString(row.metadata, 'streamRunId');
	if (streamRunId) {
		const turn = turnByStreamRunId.get(streamRunId);
		const turnIndex = turn ? turnIndexById.get(turn.id) : null;
		if (turn && turnIndex) return { turn, turnIndex, attribution: 'exact' };
	}

	const sessionId = row.chat_session_id;
	const clientTurnId = row.client_turn_id || metadataString(row.metadata, 'clientTurnId');
	if (sessionId && clientTurnId) {
		const turn = turnByClientTurnKey.get(`${sessionId}:${clientTurnId}`);
		const turnIndex = turn ? turnIndexById.get(turn.id) : null;
		if (turn && turnIndex) return { turn, turnIndex, attribution: 'exact' };
	}

	if (!sessionId) return null;
	const turns = turnsBySession.get(sessionId) ?? [];
	if (turns.length === 0) return null;
	const usageTime =
		dateMs(row.request_started_at) ??
		dateMs(row.created_at) ??
		dateMs(row.request_completed_at);
	if (usageTime === null) return null;

	for (let index = 0; index < turns.length; index += 1) {
		const turn = turns[index]!;
		const start = dateMs(turn.started_at ?? turn.created_at);
		if (start === null) continue;
		const explicitFinish = dateMs(turn.finished_at);
		const nextStart = dateMs(turns[index + 1]?.started_at ?? turns[index + 1]?.created_at);
		const finish = explicitFinish ?? nextStart ?? Number.POSITIVE_INFINITY;
		if (usageTime >= start && usageTime <= finish) {
			return { turn, turnIndex: index + 1, attribution: 'inferred' };
		}
	}

	return null;
};

const createSessionAggregate = (
	sessionId: string,
	session: ChatCostSessionRow | undefined,
	userById: Map<string, ChatCostUserRow>
): SessionAggregate => {
	const userId = session?.user_id ?? null;
	const user = userId ? userById.get(userId) : null;
	return {
		id: sessionId,
		user_id: userId,
		title: sessionTitle(session),
		user_email: session?.users?.email ?? user?.email ?? 'Unknown',
		context_type: session?.context_type ?? 'global',
		created_at: safeDate(session?.created_at),
		cost: 0,
		input_cost: 0,
		output_cost: 0,
		prompt_tokens: 0,
		completion_tokens: 0,
		tokens: 0,
		llm_calls: 0,
		model_costs: new Map(),
		turn_ids: new Set(),
		max_turn_cost: 0,
		max_turn_id: null,
		unattributed_cost: 0
	};
};

const createTurnAggregate = (lookup: TurnLookup, session: SessionAggregate): TurnAggregate => ({
	id: lookup.turn.id,
	turn_run_id: lookup.turn.id,
	session_id: lookup.turn.session_id,
	user_id: lookup.turn.user_id ?? session.user_id,
	user_email: session.user_email,
	session_title: session.title,
	turn_index: lookup.turnIndex,
	request_message: lookup.turn.request_message ?? '',
	started_at: safeDate(lookup.turn.started_at ?? lookup.turn.created_at),
	finished_at: safeDate(lookup.turn.finished_at),
	status: lookup.turn.status ?? 'unknown',
	history_strategy: lookup.turn.history_strategy ?? null,
	history_compressed:
		typeof lookup.turn.history_compressed === 'boolean' ? lookup.turn.history_compressed : null,
	raw_history_count: asNumber(lookup.turn.raw_history_count),
	history_for_model_count: asNumber(lookup.turn.history_for_model_count),
	llm_pass_count: asNumber(lookup.turn.llm_pass_count),
	tool_call_count: asNumber(lookup.turn.tool_call_count),
	attribution: lookup.attribution,
	cost: 0,
	input_cost: 0,
	output_cost: 0,
	prompt_tokens: 0,
	completion_tokens: 0,
	tokens: 0,
	llm_calls: 0,
	model_costs: new Map()
});

export const buildChatCostAnalytics = (params: {
	usageRows: ChatCostUsageRow[];
	sessions: ChatCostSessionRow[];
	turnRuns: ChatCostTurnRunRow[];
	users: ChatCostUserRow[];
}) => {
	const sessionsById = new Map(params.sessions.map((session) => [session.id, session]));
	const userById = new Map(params.users.map((user) => [user.id, user]));
	for (const session of params.sessions) {
		if (session.user_id && session.users?.email && !userById.has(session.user_id)) {
			userById.set(session.user_id, {
				id: session.user_id,
				email: session.users.email,
				name: session.users.name
			});
		}
	}

	const turnsBySession = new Map<string, ChatCostTurnRunRow[]>();
	for (const turn of params.turnRuns) {
		const turns = turnsBySession.get(turn.session_id) ?? [];
		turns.push(turn);
		turnsBySession.set(turn.session_id, turns);
	}
	for (const [sessionId, turns] of turnsBySession.entries()) {
		turnsBySession.set(sessionId, sortTurns(turns));
	}

	const turnById = new Map<string, ChatCostTurnRunRow>();
	const turnIndexById = new Map<string, number>();
	const turnByStreamRunId = new Map<string, ChatCostTurnRunRow>();
	const turnByClientTurnKey = new Map<string, ChatCostTurnRunRow>();
	for (const turns of turnsBySession.values()) {
		turns.forEach((turn, index) => {
			turnById.set(turn.id, turn);
			turnIndexById.set(turn.id, index + 1);
			if (turn.stream_run_id) turnByStreamRunId.set(turn.stream_run_id, turn);
			if (turn.client_turn_id) {
				turnByClientTurnKey.set(`${turn.session_id}:${turn.client_turn_id}`, turn);
			}
		});
	}

	const sessionStats = new Map<string, SessionAggregate>();
	const turnStats = new Map<string, TurnAggregate>();
	const modelStats = new Map<string, ModelAggregate>();
	const userStats = new Map<
		string,
		{
			user_id: string;
			email: string;
			total_cost: number;
			total_tokens: number;
			session_ids: Set<string>;
		}
	>();
	const costByDate: Record<
		string,
		{
			date: string;
			prompt_tokens: number;
			completion_tokens: number;
			total_tokens: number;
			input_cost: number;
			output_cost: number;
			total_cost: number;
			requests: number;
		}
	> = {};

	let totalCost = 0;
	let inputCostTotal = 0;
	let outputCostTotal = 0;
	let promptTokensTotal = 0;
	let completionTokensTotal = 0;
	let totalTokens = 0;
	let attributedCost = 0;
	let inferredCost = 0;
	let unattributedCost = 0;

	for (const row of params.usageRows) {
		const sessionId = row.chat_session_id;
		if (!sessionId) continue;

		const promptTokens = asNumber(row.prompt_tokens);
		const completionTokens = asNumber(row.completion_tokens);
		const rowTokens = asNumber(row.total_tokens) || promptTokens + completionTokens;
		const inputCost = asNumber(row.input_cost_usd);
		const outputCost = asNumber(row.output_cost_usd);
		const rowCost = asNumber(row.total_cost_usd) || inputCost + outputCost;
		const model = normalizeText(row.model_used) || 'unknown';
		const session =
			sessionStats.get(sessionId) ??
			createSessionAggregate(sessionId, sessionsById.get(sessionId), userById);
		sessionStats.set(sessionId, session);

		totalCost += rowCost;
		inputCostTotal += inputCost;
		outputCostTotal += outputCost;
		promptTokensTotal += promptTokens;
		completionTokensTotal += completionTokens;
		totalTokens += rowTokens;

		session.cost += rowCost;
		session.input_cost += inputCost;
		session.output_cost += outputCost;
		session.prompt_tokens += promptTokens;
		session.completion_tokens += completionTokens;
		session.tokens += rowTokens;
		session.llm_calls += 1;
		session.model_costs.set(model, (session.model_costs.get(model) ?? 0) + rowCost);

		const userId = row.user_id ?? session.user_id;
		if (userId) {
			const user = userById.get(userId);
			const userEntry = userStats.get(userId) ?? {
				user_id: userId,
				email: user?.email ?? session.user_email ?? 'Unknown',
				total_cost: 0,
				total_tokens: 0,
				session_ids: new Set<string>()
			};
			userEntry.total_cost += rowCost;
			userEntry.total_tokens += rowTokens;
			userEntry.session_ids.add(sessionId);
			userStats.set(userId, userEntry);
		}

		const modelEntry = modelStats.get(model) ?? {
			model,
			requests: 0,
			cost: 0,
			attributed_cost: 0,
			unattributed_cost: 0,
			input_cost: 0,
			output_cost: 0,
			prompt_tokens: 0,
			completion_tokens: 0,
			tokens: 0,
			turn_costs: new Map()
		};
		modelEntry.requests += 1;
		modelEntry.cost += rowCost;
		modelEntry.input_cost += inputCost;
		modelEntry.output_cost += outputCost;
		modelEntry.prompt_tokens += promptTokens;
		modelEntry.completion_tokens += completionTokens;
		modelEntry.tokens += rowTokens;
		modelStats.set(model, modelEntry);

		const date = row.created_at?.split('T')[0];
		if (date) {
			const entry =
				costByDate[date] ??
				(costByDate[date] = {
					date,
					prompt_tokens: 0,
					completion_tokens: 0,
					total_tokens: 0,
					input_cost: 0,
					output_cost: 0,
					total_cost: 0,
					requests: 0
				});
			entry.prompt_tokens += promptTokens;
			entry.completion_tokens += completionTokens;
			entry.total_tokens += rowTokens;
			entry.input_cost += inputCost;
			entry.output_cost += outputCost;
			entry.total_cost += rowCost;
			entry.requests += 1;
		}

		const lookup = resolveUsageTurn({
			row,
			turnById,
			turnIndexById,
			turnByStreamRunId,
			turnByClientTurnKey,
			turnsBySession
		});

		if (!lookup) {
			session.unattributed_cost += rowCost;
			modelEntry.unattributed_cost += rowCost;
			unattributedCost += rowCost;
			continue;
		}

		const turn = turnStats.get(lookup.turn.id) ?? createTurnAggregate(lookup, session);
		if (turn.attribution !== 'exact' && lookup.attribution === 'exact') {
			turn.attribution = 'exact';
		}
		turn.cost += rowCost;
		turn.input_cost += inputCost;
		turn.output_cost += outputCost;
		turn.prompt_tokens += promptTokens;
		turn.completion_tokens += completionTokens;
		turn.tokens += rowTokens;
		turn.llm_calls += 1;
		turn.model_costs.set(model, (turn.model_costs.get(model) ?? 0) + rowCost);
		turnStats.set(turn.id, turn);

		session.turn_ids.add(turn.id);
		modelEntry.turn_costs.set(turn.id, (modelEntry.turn_costs.get(turn.id) ?? 0) + rowCost);
		modelEntry.attributed_cost += rowCost;

		if (turn.cost > session.max_turn_cost) {
			session.max_turn_cost = turn.cost;
			session.max_turn_id = turn.id;
		}

		if (lookup.attribution === 'exact') attributedCost += rowCost;
		else inferredCost += rowCost;
	}

	const turns = Array.from(turnStats.values());
	const sessions = Array.from(sessionStats.values());
	const turnCosts = turns.map((turn) => turn.cost);
	const sessionCosts = sessions.map((session) => session.cost);
	const turnCostTotal = attributedCost + inferredCost;

	const topTurns = turns
		.sort((a, b) => b.cost - a.cost)
		.slice(0, 30)
		.map((turn) => ({
			id: turn.id,
			turn_run_id: turn.turn_run_id,
			session_id: turn.session_id,
			turn_index: turn.turn_index,
			session_title: turn.session_title,
			user_email: turn.user_email,
			request_message: turn.request_message,
			prompt_preview: previewText(turn.request_message, 220),
			models: Array.from(turn.model_costs.keys()),
			primary_model: primaryModel(turn.model_costs),
			cost: turn.cost,
			input_cost: turn.input_cost,
			output_cost: turn.output_cost,
			prompt_tokens: turn.prompt_tokens,
			completion_tokens: turn.completion_tokens,
			tokens: turn.tokens,
			llm_calls: turn.llm_calls,
			llm_pass_count: turn.llm_pass_count,
			tool_call_count: turn.tool_call_count,
			history_strategy: turn.history_strategy,
			history_compressed: turn.history_compressed,
			raw_history_count: turn.raw_history_count,
			history_for_model_count: turn.history_for_model_count,
			attribution: turn.attribution,
			started_at: turn.started_at,
			details_url: `${DETAILS_BASE_URL}${encodeURIComponent(turn.session_id)}`
		}));

	const topSessions = sessions
		.sort((a, b) => b.cost - a.cost)
		.slice(0, 30)
		.map((session) => {
			const maxTurn = session.max_turn_id ? turnStats.get(session.max_turn_id) : null;
			return {
				id: session.id,
				title: session.title,
				user_email: session.user_email,
				context_type: session.context_type,
				cost: session.cost,
				input_cost: session.input_cost,
				output_cost: session.output_cost,
				tokens: session.tokens,
				prompt_tokens: session.prompt_tokens,
				completion_tokens: session.completion_tokens,
				llm_calls: session.llm_calls,
				turn_count: session.turn_ids.size,
				avg_cost_per_turn:
					session.turn_ids.size > 0
						? (session.cost - session.unattributed_cost) / session.turn_ids.size
						: 0,
				max_turn_cost: session.max_turn_cost,
				max_turn_index: maxTurn?.turn_index ?? null,
				max_turn_prompt_preview: previewText(maxTurn?.request_message, 180),
				primary_model: primaryModel(session.model_costs),
				unattributed_cost: session.unattributed_cost,
				created_at: session.created_at,
				details_url: `${DETAILS_BASE_URL}${encodeURIComponent(session.id)}`
			};
		});

	const byModel = Array.from(modelStats.values())
		.map((model) => {
			const perTurnCosts = Array.from(model.turn_costs.values());
			return {
				model: model.model,
				requests: model.requests,
				turn_count: model.turn_costs.size,
				tokens: model.tokens,
				prompt_tokens: model.prompt_tokens,
				completion_tokens: model.completion_tokens,
				cost: model.cost,
				attributed_cost: model.attributed_cost,
				unattributed_cost: model.unattributed_cost,
				input_cost: model.input_cost,
				output_cost: model.output_cost,
				avg_cost_per_request: model.requests > 0 ? model.cost / model.requests : 0,
				avg_cost_per_turn:
					perTurnCosts.length > 0 ? model.attributed_cost / perTurnCosts.length : 0,
				median_cost_per_turn: percentile(perTurnCosts, 50),
				p95_cost_per_turn: percentile(perTurnCosts, 95)
			};
		})
		.sort((a, b) => b.cost - a.cost);

	const turnIndexGroups = new Map<number, TurnAggregate[]>();
	for (const turn of turns) {
		const group = turnIndexGroups.get(turn.turn_index) ?? [];
		group.push(turn);
		turnIndexGroups.set(turn.turn_index, group);
	}
	const costByTurnIndex = Array.from(turnIndexGroups.entries())
		.sort((a, b) => a[0] - b[0])
		.map(([turnIndex, group]) => {
			const costs = group.map((turn) => turn.cost);
			const promptTokenValues = group.map((turn) => turn.prompt_tokens);
			return {
				turn_index: turnIndex,
				turn_count: group.length,
				total_cost: costs.reduce((sum, value) => sum + value, 0),
				avg_cost: average(costs),
				median_cost: percentile(costs, 50),
				p90_cost: percentile(costs, 90),
				max_cost: Math.max(...costs, 0),
				avg_prompt_tokens: average(promptTokenValues),
				avg_total_tokens: average(group.map((turn) => turn.tokens))
			};
		});

	const growthRatios = costByTurnIndex
		.map((entry, index) => {
			const previous = costByTurnIndex[index - 1];
			if (!previous || previous.avg_cost <= 0) return null;
			return entry.avg_cost / previous.avg_cost;
		})
		.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
	const firstTurnAvg = costByTurnIndex[0]?.avg_cost ?? 0;
	const lastTurnAvg = costByTurnIndex[costByTurnIndex.length - 1]?.avg_cost ?? 0;
	const averageGrowthRatio = average(growthRatios);
	const maxGrowthRatio = growthRatios.length > 0 ? Math.max(...growthRatios) : 0;
	const growthShape =
		costByTurnIndex.length < 3
			? 'not_enough_data'
			: averageGrowthRatio > 1.5 && lastTurnAvg > firstTurnAvg * 3
				? 'compounding'
				: lastTurnAvg > firstTurnAvg * 1.5
					? 'rising'
					: 'stable';

	return {
		overview: {
			total_tokens: totalTokens,
			total_cost: totalCost,
			chat_tokens: totalTokens,
			chat_cost: totalCost,
			agent_tokens: 0,
			agent_cost: 0,
			prompt_tokens: promptTokensTotal,
			completion_tokens: completionTokensTotal,
			input_cost: inputCostTotal,
			output_cost: outputCostTotal,
			llm_calls: params.usageRows.length,
			session_count: sessions.length,
			turn_count: turns.length,
			avg_cost_per_session: sessions.length > 0 ? totalCost / sessions.length : 0,
			avg_cost_per_turn: turns.length > 0 ? turnCostTotal / turns.length : 0,
			median_turn_cost: percentile(turnCosts, 50),
			p95_turn_cost: percentile(turnCosts, 95),
			max_turn_cost: Math.max(...turnCosts, 0),
			median_session_cost: percentile(sessionCosts, 50),
			p95_session_cost: percentile(sessionCosts, 95),
			max_session_cost: Math.max(...sessionCosts, 0),
			attributed_cost: attributedCost,
			inferred_cost: inferredCost,
			unattributed_cost: unattributedCost
		},
		by_model: byModel,
		top_sessions: topSessions,
		top_turns: topTurns,
		top_prompts: topTurns,
		top_users: Array.from(userStats.values())
			.sort((a, b) => b.total_cost - a.total_cost)
			.slice(0, 20)
			.map((user) => ({
				user_id: user.user_id,
				email: user.email,
				total_tokens: user.total_tokens,
				total_cost: user.total_cost,
				session_count: user.session_ids.size
			})),
		cost_trends: Object.values(costByDate).sort((a, b) => a.date.localeCompare(b.date)),
		cost_by_turn_index: costByTurnIndex,
		growth_summary: {
			shape: growthShape,
			first_turn_avg_cost: firstTurnAvg,
			last_turn_avg_cost: lastTurnAvg,
			average_growth_ratio: averageGrowthRatio,
			max_growth_ratio: maxGrowthRatio
		},
		compression_savings: {
			tokens_saved: 0,
			cost_saved: 0
		},
		pricing: {
			INPUT_COST_PER_M:
				promptTokensTotal > 0 ? (inputCostTotal / promptTokensTotal) * 1_000_000 : 0,
			OUTPUT_COST_PER_M:
				completionTokensTotal > 0
					? (outputCostTotal / completionTokensTotal) * 1_000_000
					: 0,
			AVG_COST_PER_M: totalTokens > 0 ? (totalCost / totalTokens) * 1_000_000 : 0
		}
	};
};
