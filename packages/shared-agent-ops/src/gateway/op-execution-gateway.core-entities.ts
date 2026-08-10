// packages/shared-agent-ops/src/gateway/op-execution-gateway.core-entities.ts
import { ensureActorId } from '../ontology/ontology-projects.service';
import {
	GOAL_STATES,
	MILESTONE_STATES,
	PLAN_STATES,
	RISK_STATES,
	isValidTypeKey
} from '../ontology/onto';
import { logCreateAsync, logUpdateAsync } from '../ops/async-activity-logger';
import {
	notifyEntityMentionsAdded,
	resolveEntityMentionUserIds
} from '../ops/entity-mention-notification.service';
import { normalizeMarkdownInput } from '../utils/markdown-normalization';
import { CORE_ENTITY_CONFIG, type ExternalEntityKind } from './op-execution-gateway.config';
import {
	assertAccessibleProject,
	assertProjectWriteAccess,
	getProjectIdsForVisibleContext,
	loadVisibleProjects,
	withProjectName
} from './op-execution-gateway.access';
import { getExternalAgentActivityContext } from './op-execution-gateway.activity';
import { createOptionalParentEdges } from './op-execution-gateway.edges';
import { loadCoreEntityForAccess } from './op-execution-gateway.entity-access';
import {
	applyArchivedReadFilter,
	normalizeArchivedReadFilter,
	normalizeArchivedUpdate,
	normalizeEntityStateFilter,
	normalizeEntityTypeFilter,
	normalizeOptionalDate,
	normalizeOptionalText,
	normalizeOptionalUuid,
	normalizeProps,
	normalizeRiskImpactFilter,
	normalizeStateValue,
	requireTrimmedString
} from './op-execution-gateway.normalization';
import {
	buildPaginationForRows,
	clampLimit,
	normalizeOffset
} from './op-execution-gateway.pagination';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import { searchEntitiesByType } from './op-execution-gateway.search';
import { serializeExternalEntity } from './op-execution-gateway.serializers';
import type { ToolExecutionContext } from './op-execution-gateway.types';

type CoreOntologyEntityKind = Exclude<ExternalEntityKind, 'project' | 'task' | 'document'>;

export async function listGoals(context: ToolExecutionContext, args: Record<string, unknown>) {
	return listCoreEntities(context, args, 'goal');
}

export async function searchGoals(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, ['goal']);
}

export async function getGoal(context: ToolExecutionContext, args: Record<string, unknown>) {
	return getCoreEntity(context, args, 'goal');
}

export async function listPlans(context: ToolExecutionContext, args: Record<string, unknown>) {
	return listCoreEntities(context, args, 'plan');
}

export async function searchPlans(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, ['plan']);
}

export async function getPlan(context: ToolExecutionContext, args: Record<string, unknown>) {
	return getCoreEntity(context, args, 'plan');
}

export async function listMilestones(context: ToolExecutionContext, args: Record<string, unknown>) {
	return listCoreEntities(context, args, 'milestone');
}

export async function searchMilestones(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	return searchEntitiesByType(context, args, ['milestone']);
}

export async function getMilestone(context: ToolExecutionContext, args: Record<string, unknown>) {
	return getCoreEntity(context, args, 'milestone');
}

export async function listRisks(context: ToolExecutionContext, args: Record<string, unknown>) {
	return listCoreEntities(context, args, 'risk');
}

export async function searchRisks(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, ['risk']);
}

export async function getRisk(context: ToolExecutionContext, args: Record<string, unknown>) {
	return getCoreEntity(context, args, 'risk');
}

async function listCoreEntities(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	kind: CoreOntologyEntityKind
) {
	const visible = await loadVisibleProjects(context);
	const limit = clampLimit(args.limit, 20, 1, 50);
	const offset = normalizeOffset(args.offset);
	const stateKey = normalizeEntityStateFilter(args.state_key, kind);
	const typeKey = normalizeEntityTypeFilter(args.type_key, kind);
	const impact = kind === 'risk' ? normalizeRiskImpactFilter(args.impact) : undefined;
	let projectIds = getProjectIdsForVisibleContext(visible);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return {
			[`${kind}s`]: [],
			total: 0,
			pagination: buildPaginationForRows(offset, limit, 0, 0)
		};
	}

	const config = CORE_ENTITY_CONFIG[kind];
	let query = context.admin
		.from(config.table)
		.select(config.select, { count: 'exact' })
		.in('project_id', projectIds)
		.order(kind === 'milestone' ? 'due_at' : 'updated_at', {
			ascending: kind === 'milestone',
			...(kind === 'milestone' ? { nullsFirst: true } : {})
		})
		.range(offset, offset + limit - 1);
	query = applyArchivedReadFilter(query, args);

	if (stateKey) {
		query = query.eq('state_key', stateKey);
	}
	if (typeKey) {
		query = query.eq('type_key', typeKey);
	}
	if (kind === 'risk' && impact) {
		query = query.eq('impact', impact);
	}

	const { data, error, count } = await query;
	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || `Failed to list ${kind}s`);
	}

	const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) =>
		withProjectName(row, visible.projectMap)
	);

	return {
		[`${kind}s`]: rows,
		total: count ?? rows.length,
		pagination: buildPaginationForRows(offset, limit, count ?? rows.length, rows.length)
	};
}

async function getCoreEntity(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	kind: CoreOntologyEntityKind
) {
	const config = CORE_ENTITY_CONFIG[kind];
	const entityId = args[config.idArg];
	const access = await loadCoreEntityForAccess(context, kind, entityId, 'read', {
		archived: normalizeArchivedReadFilter(args.archived)
	});
	return {
		[config.resultKey]: serializeExternalEntity(kind, access.entity, access.project.name)
	};
}

export async function createGoal(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project, context.scope);
	const actorId = await ensureActorId(context.admin, context.userId);
	const name = requireTrimmedString(args.name, 'name');
	const stateKey = normalizeStateValue(args.state_key, 'state_key', GOAL_STATES, 'draft');
	const targetDate = normalizeOptionalDate(args.target_date, 'target_date');
	const description =
		normalizeOptionalText(args.description, 'description', { allowNull: true }) || null;
	const goalBody = normalizeOptionalText(args.goal, 'goal', { allowNull: true }) || null;
	const measurementCriteria =
		normalizeOptionalText(args.measurement_criteria, 'measurement_criteria', {
			allowNull: true
		}) || null;
	const props = normalizeProps(args.props, 'props') ?? {};
	const insertPayload: Record<string, unknown> = {
		project_id: project.id,
		name,
		goal: goalBody ?? null,
		description: description ?? null,
		type_key: normalizeCoreTypeKey(
			args.type_key,
			'goal',
			'goal.outcome.project',
			'goal.default'
		),
		state_key: stateKey,
		target_date: targetDate ?? null,
		completed_at: stateKey === 'achieved' ? new Date().toISOString() : null,
		created_by: actorId,
		props: {
			...props,
			goal: goalBody ?? null,
			description: description ?? null,
			target_date: targetDate ?? null,
			measurement_criteria: measurementCriteria ?? null,
			priority: args.priority ?? null
		}
	};

	const { data, error } = await context.admin
		.from('onto_goals')
		.insert(insertPayload)
		.select(CORE_ENTITY_CONFIG.goal.select)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError('INTERNAL', error?.message || 'Failed to create goal');
	}

	await syncGoalMentionSideEffects(context, project, data as Record<string, unknown>);

	await logCreateAsync(
		context.admin,
		project.id,
		'goal',
		String(data.id),
		{ name: data.name, type_key: data.type_key, state_key: data.state_key },
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		goal: serializeExternalEntity('goal', data as Record<string, unknown>, project.name),
		message: `Created ontology goal "${data.name ?? 'Goal'}".`
	};
}

export async function updateGoal(context: ToolExecutionContext, args: Record<string, unknown>) {
	return updateCoreEntity(
		context,
		args,
		'goal',
		(existing) => {
			const updateData: Record<string, unknown> = {};
			if (args.name !== undefined) updateData.name = requireTrimmedString(args.name, 'name');
			if (args.description !== undefined) {
				updateData.description =
					normalizeOptionalText(args.description, 'description', { allowNull: true }) ||
					null;
			}
			if (args.type_key !== undefined) {
				updateData.type_key = normalizeCoreTypeKey(
					args.type_key,
					'goal',
					typeof existing.type_key === 'string' ? existing.type_key : 'goal.default',
					typeof existing.type_key === 'string' ? existing.type_key : 'goal.default'
				);
			}
			if (args.state_key !== undefined) {
				updateData.state_key = normalizeStateValue(
					args.state_key,
					'state_key',
					GOAL_STATES
				);
				updateData.completed_at =
					updateData.state_key === 'achieved'
						? (existing.completed_at ?? new Date().toISOString())
						: null;
			}
			if (args.target_date !== undefined) {
				updateData.target_date = normalizeOptionalDate(args.target_date, 'target_date');
			}
			if (
				args.props !== undefined ||
				args.description !== undefined ||
				args.state_key !== undefined ||
				args.target_date !== undefined ||
				args.measurement_criteria !== undefined ||
				args.priority !== undefined
			) {
				updateData.props = {
					...((existing.props as Record<string, unknown> | null) ?? {}),
					...(normalizeProps(args.props, 'props') ?? {}),
					...(args.description !== undefined
						? { description: updateData.description }
						: {}),
					...(args.state_key !== undefined ? { state_key: updateData.state_key } : {}),
					...(args.target_date !== undefined
						? { target_date: updateData.target_date }
						: {}),
					...(args.measurement_criteria !== undefined
						? {
								measurement_criteria:
									normalizeOptionalText(
										args.measurement_criteria,
										'measurement_criteria',
										{ allowNull: true }
									) || null
							}
						: {}),
					...(args.priority !== undefined ? { priority: args.priority || null } : {})
				};
			}
			return updateData;
		},
		({ existing, updated, project }) =>
			syncGoalMentionSideEffects(context, project, updated, existing)
	);
}

export async function createPlan(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project, context.scope);
	const actorId = await ensureActorId(context.admin, context.userId);
	const name = requireTrimmedString(args.name, 'name');
	const description =
		normalizeOptionalText(args.description, 'description', { allowNull: true }) || null;
	const planBody = normalizeMarkdownInput(typeof args.plan === 'string' ? args.plan : null);
	const stateKey = normalizeStateValue(args.state_key, 'state_key', PLAN_STATES, 'draft');
	const props = normalizeProps(args.props, 'props') ?? {};
	const startDate =
		normalizeOptionalText(args.start_date, 'start_date', { allowNull: true }) || null;
	const endDate = normalizeOptionalText(args.end_date, 'end_date', { allowNull: true }) || null;
	const insertPayload: Record<string, unknown> = {
		project_id: project.id,
		name,
		description: description ?? null,
		plan: planBody || null,
		type_key: normalizeCoreTypeKey(args.type_key, 'plan', 'plan.phase.project', 'plan.default'),
		state_key: stateKey,
		created_by: actorId,
		props: {
			...props,
			plan: planBody || null,
			description: description ?? null,
			start_date: startDate ?? null,
			end_date: endDate ?? null
		}
	};

	const { data, error } = await context.admin
		.from('onto_plans')
		.insert(insertPayload)
		.select(CORE_ENTITY_CONFIG.plan.select)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError('INTERNAL', error?.message || 'Failed to create plan');
	}

	await createOptionalParentEdges(context, project, 'plan', String(data.id), [
		...(typeof args.goal_id === 'string'
			? [{ kind: 'goal', id: args.goal_id, rel: 'has_plan' }]
			: []),
		...(typeof args.milestone_id === 'string'
			? [{ kind: 'milestone', id: args.milestone_id, rel: 'has_plan' }]
			: [])
	]);
	await logCreateAsync(
		context.admin,
		project.id,
		'plan',
		String(data.id),
		{ name: data.name, type_key: data.type_key, state_key: data.state_key },
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		plan: serializeExternalEntity('plan', data as Record<string, unknown>, project.name),
		message: `Created ontology plan "${data.name ?? 'Plan'}".`
	};
}

export async function updatePlan(context: ToolExecutionContext, args: Record<string, unknown>) {
	return updateCoreEntity(context, args, 'plan', (existing) => {
		const updateData: Record<string, unknown> = {};
		if (args.name !== undefined) updateData.name = requireTrimmedString(args.name, 'name');
		if (args.description !== undefined) {
			updateData.description =
				normalizeOptionalText(args.description, 'description', { allowNull: true }) || null;
		}
		if (args.plan !== undefined) {
			updateData.plan =
				normalizeMarkdownInput(typeof args.plan === 'string' ? args.plan : null) || null;
		}
		if (args.type_key !== undefined) {
			updateData.type_key = normalizeCoreTypeKey(
				args.type_key,
				'plan',
				typeof existing.type_key === 'string' ? existing.type_key : 'plan.default',
				typeof existing.type_key === 'string' ? existing.type_key : 'plan.default'
			);
		}
		if (args.state_key !== undefined) {
			updateData.state_key = normalizeStateValue(args.state_key, 'state_key', PLAN_STATES);
		}
		if (
			args.props !== undefined ||
			args.plan !== undefined ||
			args.description !== undefined ||
			args.start_date !== undefined ||
			args.end_date !== undefined
		) {
			updateData.props = {
				...((existing.props as Record<string, unknown> | null) ?? {}),
				...(normalizeProps(args.props, 'props') ?? {}),
				...(args.plan !== undefined ? { plan: updateData.plan } : {}),
				...(args.description !== undefined ? { description: updateData.description } : {}),
				...(args.start_date !== undefined
					? {
							start_date:
								normalizeOptionalText(args.start_date, 'start_date', {
									allowNull: true
								}) || null
						}
					: {}),
				...(args.end_date !== undefined
					? {
							end_date:
								normalizeOptionalText(args.end_date, 'end_date', {
									allowNull: true
								}) || null
						}
					: {})
			};
		}
		return updateData;
	});
}

export async function createMilestone(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project, context.scope);
	const goalId = normalizeOptionalUuid(args.goal_id, 'goal_id');
	if (!goalId) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'goal_id is required for milestones'
		);
	}
	await loadCoreEntityForAccess(context, 'goal', goalId, 'write');
	const actorId = await ensureActorId(context.admin, context.userId);
	const title = requireTrimmedString(args.title, 'title');
	const stateKey = normalizeStateValue(args.state_key, 'state_key', MILESTONE_STATES, 'pending');
	const dueAt = normalizeOptionalDate(args.due_at, 'due_at');
	const description =
		normalizeOptionalText(args.description, 'description', { allowNull: true }) || null;
	const milestone =
		normalizeOptionalText(args.milestone, 'milestone', { allowNull: true }) || null;
	const props = normalizeProps(args.props, 'props') ?? {};
	const { data, error } = await context.admin
		.from('onto_milestones')
		.insert({
			project_id: project.id,
			title,
			milestone: milestone ?? null,
			description: description ?? null,
			type_key: 'milestone.default',
			state_key: stateKey,
			due_at: dueAt ?? null,
			props: {
				...props,
				description,
				state_key: stateKey
			},
			created_by: actorId
		})
		.select(CORE_ENTITY_CONFIG.milestone.select)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error?.message || 'Failed to create milestone'
		);
	}

	await createOptionalParentEdges(context, project, 'milestone', String(data.id), [
		{ kind: 'goal', id: goalId, rel: 'has_milestone' }
	]);
	await logCreateAsync(
		context.admin,
		project.id,
		'milestone',
		String(data.id),
		{ title: data.title, state_key: data.state_key },
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		milestone: serializeExternalEntity(
			'milestone',
			data as Record<string, unknown>,
			project.name
		),
		message: `Created ontology milestone "${data.title ?? 'Milestone'}".`
	};
}

export async function updateMilestone(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	return updateCoreEntity(context, args, 'milestone', (existing) => {
		const updateData: Record<string, unknown> = {};
		if (args.title !== undefined) updateData.title = requireTrimmedString(args.title, 'title');
		if (args.description !== undefined) {
			updateData.description =
				normalizeOptionalText(args.description, 'description', { allowNull: true }) || null;
		}
		if (args.due_at !== undefined)
			updateData.due_at = normalizeOptionalDate(args.due_at, 'due_at');
		if (args.state_key !== undefined) {
			updateData.state_key = normalizeStateValue(
				args.state_key,
				'state_key',
				MILESTONE_STATES
			);
			updateData.completed_at =
				updateData.state_key === 'completed'
					? (existing.completed_at ?? new Date().toISOString())
					: null;
		}
		if (
			args.props !== undefined ||
			args.description !== undefined ||
			args.state_key !== undefined
		) {
			updateData.props = {
				...((existing.props as Record<string, unknown> | null) ?? {}),
				...(normalizeProps(args.props, 'props') ?? {}),
				...(args.description !== undefined ? { description: updateData.description } : {}),
				...(args.state_key !== undefined ? { state_key: updateData.state_key } : {})
			};
		}
		return updateData;
	});
}

export async function createRisk(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project, context.scope);
	const actorId = await ensureActorId(context.admin, context.userId);
	const title = requireTrimmedString(args.title, 'title');
	const impact = requireTrimmedString(args.impact, 'impact') ?? '';
	if (!['low', 'medium', 'high', 'critical'].includes(impact)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'impact must be one of: low, medium, high, critical'
		);
	}
	const probability =
		args.probability === undefined
			? null
			: typeof args.probability === 'number' &&
				  Number.isFinite(args.probability) &&
				  args.probability >= 0 &&
				  args.probability <= 1
				? args.probability
				: (() => {
						throw new ExternalToolGatewayError(
							'VALIDATION_ERROR',
							'probability must be a number between 0 and 1'
						);
					})();
	const stateKey = normalizeStateValue(args.state_key, 'state_key', RISK_STATES, 'identified');
	const content =
		normalizeOptionalText(args.content, 'content', { allowNull: true }) ||
		normalizeOptionalText(args.description, 'description', { allowNull: true }) ||
		null;
	const mitigationStrategy =
		normalizeOptionalText(args.mitigation_strategy, 'mitigation_strategy', {
			allowNull: true
		}) || null;
	const props = normalizeProps(args.props, 'props') ?? {};
	const { data, error } = await context.admin
		.from('onto_risks')
		.insert({
			project_id: project.id,
			title,
			impact,
			probability,
			state_key: stateKey,
			content,
			type_key: 'risk.default',
			props: {
				...props,
				description: content,
				mitigation_strategy: mitigationStrategy ?? null
			},
			...(stateKey === 'mitigated' ? { mitigated_at: new Date().toISOString() } : {}),
			created_by: actorId
		})
		.select(CORE_ENTITY_CONFIG.risk.select)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError('INTERNAL', error?.message || 'Failed to create risk');
	}

	await logCreateAsync(
		context.admin,
		project.id,
		'risk',
		String(data.id),
		{ title: data.title, impact: data.impact, state_key: data.state_key },
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		risk: serializeExternalEntity('risk', data as Record<string, unknown>, project.name),
		message: `Created ontology risk "${data.title ?? 'Risk'}".`
	};
}

export async function updateRisk(context: ToolExecutionContext, args: Record<string, unknown>) {
	return updateCoreEntity(context, args, 'risk', (existing) => {
		const updateData: Record<string, unknown> = {};
		if (args.title !== undefined) updateData.title = requireTrimmedString(args.title, 'title');
		if (args.impact !== undefined) {
			const impact = requireTrimmedString(args.impact, 'impact') ?? '';
			if (!['low', 'medium', 'high', 'critical'].includes(impact)) {
				throw new ExternalToolGatewayError(
					'VALIDATION_ERROR',
					'impact must be one of: low, medium, high, critical'
				);
			}
			updateData.impact = impact;
		}
		if (args.probability !== undefined) {
			updateData.probability =
				typeof args.probability === 'number' &&
				Number.isFinite(args.probability) &&
				args.probability >= 0 &&
				args.probability <= 1
					? args.probability
					: (() => {
							throw new ExternalToolGatewayError(
								'VALIDATION_ERROR',
								'probability must be a number between 0 and 1'
							);
						})();
		}
		if (args.state_key !== undefined) {
			updateData.state_key = normalizeStateValue(args.state_key, 'state_key', RISK_STATES);
			updateData.mitigated_at =
				updateData.state_key === 'mitigated'
					? (existing.mitigated_at ?? new Date().toISOString())
					: null;
		}
		if (args.content !== undefined) {
			updateData.content =
				normalizeOptionalText(args.content, 'content', { allowNull: true }) || null;
		}
		if (
			args.props !== undefined ||
			args.description !== undefined ||
			args.mitigation_strategy !== undefined ||
			args.owner !== undefined
		) {
			updateData.props = {
				...((existing.props as Record<string, unknown> | null) ?? {}),
				...(normalizeProps(args.props, 'props') ?? {}),
				...(args.description !== undefined
					? {
							description:
								normalizeOptionalText(args.description, 'description', {
									allowNull: true
								}) || null
						}
					: {}),
				...(args.mitigation_strategy !== undefined
					? {
							mitigation_strategy:
								normalizeOptionalText(
									args.mitigation_strategy,
									'mitigation_strategy',
									{ allowNull: true }
								) || null
						}
					: {}),
				...(args.owner !== undefined
					? {
							owner:
								normalizeOptionalText(args.owner, 'owner', { allowNull: true }) ||
								null
						}
					: {})
			};
		}
		return updateData;
	});
}

async function updateCoreEntity(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	kind: CoreOntologyEntityKind,
	buildUpdateData: (existing: Record<string, unknown>) => Record<string, unknown>,
	afterUpdate?: (params: {
		existing: Record<string, unknown>;
		updated: Record<string, unknown>;
		project: Awaited<ReturnType<typeof loadCoreEntityForAccess>>['project'];
	}) => Promise<void>
) {
	const config = CORE_ENTITY_CONFIG[kind];
	const archivedAtUpdate = normalizeArchivedUpdate(args.archived);
	const access = await loadCoreEntityForAccess(context, kind, args[config.idArg], 'write', {
		includeArchived: archivedAtUpdate === null
	});
	const updateData = buildUpdateData(access.entity);
	if (archivedAtUpdate !== undefined) {
		updateData.archived_at = archivedAtUpdate;
	}
	const meaningfulKeys = Object.keys(updateData);
	if (meaningfulKeys.length === 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`At least one writable ${kind} field is required`
		);
	}

	updateData.updated_at = new Date().toISOString();
	const { data, error } = await context.admin
		.from(config.table)
		.update(updateData)
		.eq('id', String(access.entity.id))
		.select(config.select)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error?.message || `Failed to update ${kind}`
		);
	}

	await afterUpdate?.({
		existing: access.entity,
		updated: data as Record<string, unknown>,
		project: access.project
	});

	await logUpdateAsync(
		context.admin,
		access.project.id,
		kind,
		String(access.entity.id),
		access.entity,
		data as Record<string, unknown>,
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		[config.resultKey]: serializeExternalEntity(
			kind,
			data as Record<string, unknown>,
			access.project.name
		),
		message: `Updated ontology ${kind} "${data[config.displayField] ?? access.entity.id}".`
	};
}

async function syncGoalMentionSideEffects(
	context: ToolExecutionContext,
	project: Awaited<ReturnType<typeof loadCoreEntityForAccess>>['project'],
	goal: Record<string, unknown>,
	previousGoal?: Record<string, unknown>
): Promise<void> {
	const textValues = (value: Record<string, unknown>) =>
		['name', 'goal', 'description'].map((field) =>
			typeof value[field] === 'string' ? (value[field] as string) : null
		);
	const mentionUserIds = await resolveEntityMentionUserIds({
		supabase: context.admin,
		projectId: project.id,
		projectOwnerActorId: project.owner_actor_id,
		actorUserId: context.userId,
		nextTextValues: textValues(goal),
		...(previousGoal ? { previousTextValues: textValues(previousGoal) } : {})
	});

	await notifyEntityMentionsAdded({
		supabase: context.admin,
		projectId: project.id,
		projectName: project.name,
		entityType: 'goal',
		entityId: String(goal.id),
		entityTitle: typeof goal.name === 'string' ? goal.name : null,
		actorUserId: context.userId,
		actorDisplayName: 'BuildOS agent',
		mentionedUserIds: mentionUserIds,
		source: 'agent_ping'
	});
}

function normalizeCoreTypeKey(
	value: unknown,
	kind: 'goal' | 'plan',
	missingFallback: string,
	invalidFallback: string
): string {
	if (value === undefined || value === null) return missingFallback;
	if (typeof value !== 'string') return invalidFallback;
	const trimmed = value.trim();
	if (!trimmed) return missingFallback;
	return isValidTypeKey(trimmed, kind) ? trimmed : invalidFallback;
}
