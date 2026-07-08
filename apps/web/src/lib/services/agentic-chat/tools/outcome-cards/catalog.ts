// apps/web/src/lib/services/agentic-chat/tools/outcome-cards/catalog.ts
import type { OutcomeCardDefinition } from './types';

const OUTCOME_CARD_ID_ALIASES: Record<string, string> = {
	project_audit: 'project_health_audit',
	project_forecast: 'project_slip_forecast'
};

const OUTCOME_CARD_CATALOG: OutcomeCardDefinition[] = [
	{
		id: 'cold_email_campaign_build',
		name: 'Cold Email Campaign Build',
		summary:
			'Turn a target segment, buyer moment, offer, and research anchors into a finished trust-preserving cold email campaign bundle.',
		domainIds: ['sales_and_growth.cold_email', 'sales_and_growth'],
		buildosCapabilityIds: ['planning', 'people_context', 'documents', 'web_research'],
		whenToUse: [
			'The user wants to build, plan, audit, or compile a cold outreach campaign.',
			'The work needs ICP, signal, offer, research, and finished email copy decisions.'
		],
		exampleRequests: [
			'Build a cold email campaign for founders at AI devtools startups.',
			'Audit this outbound sequence and make it feel less generic.'
		],
		defaultSkillId: 'cold_email_engagement_first_outreach',
		skillIds: [
			'cold_email_engagement_first_outreach',
			'cold_email_icp_signal_design',
			'cold_email_offer_lab',
			'cold_email_research_anchors',
			'cold_email_outreach_compiler'
		],
		toolHints: ['web_research', 'create_onto_document'],
		outputs: [
			'ICP and signal definition',
			'cold offer hypothesis',
			'research anchor plan',
			'email or sequence draft',
			'campaign review checklist'
		],
		evaluationCriteria: [
			'Outreach is specific to the target and buyer moment.',
			'The offer is concrete and low-friction.',
			'Research anchors are plausible and not fabricated.',
			'The message avoids scale-first deliverability risks.'
		],
		coverageStatus: 'strong'
	},
	{
		id: 'cold_email_sender_readiness',
		name: 'Cold Email Sender Readiness',
		summary:
			'Check sender trust, domain posture, volume, warmup, inbox health, and complaint risk before outbound volume increases.',
		domainIds: ['sales_and_growth.cold_email', 'sales_and_growth'],
		buildosCapabilityIds: ['planning', 'documents', 'web_research'],
		whenToUse: [
			'Deliverability, sending volume, cold domains, warmup, or complaint risk is central.',
			'The user is preparing infrastructure before scaling outbound.'
		],
		exampleRequests: [
			'Can I start sending 500 cold emails a day from this domain?',
			'Create a sender readiness checklist before we launch outbound.'
		],
		defaultSkillId: 'cold_email_deliverability_readiness',
		skillIds: ['cold_email_engagement_first_outreach', 'cold_email_deliverability_readiness'],
		toolHints: ['create_onto_document'],
		outputs: [
			'sender readiness checklist',
			'deliverability risk assessment',
			'volume ramp recommendation',
			'launch blockers'
		],
		evaluationCriteria: [
			'Recommendations are conservative about sender reputation.',
			'Volume guidance accounts for domain age, inbox health, and complaint risk.',
			'The plan separates setup work from copy or targeting work.'
		],
		coverageStatus: 'strong'
	},
	{
		id: 'youtube_growth_strategy_plan',
		name: 'YouTube Growth Strategy Plan',
		summary:
			'Plan YouTube channel positioning, content game, publishing rhythm, and video roadmap from currently registered strategy skills.',
		domainIds: ['marketing.youtube_growth', 'marketing.content_strategy', 'creator_growth'],
		buildosCapabilityIds: ['planning', 'documents', 'web_research'],
		whenToUse: [
			'The user wants a channel growth plan, positioning direction, or first-video roadmap.',
			'The user is asking about YouTube audience growth rather than one short-form asset.'
		],
		exampleRequests: [
			'I want to grow my YouTube audience and plan the next videos.',
			'Help me choose the first 10 videos for a founder-led YouTube channel.'
		],
		defaultSkillId: 'content_strategy_beyond_blogging',
		skillIds: [
			'content_strategy_beyond_blogging',
			'algorithm_aware_publishing',
			'viral_video_script_structure'
		],
		resourceIds: ['youtube_library.marketing_and_content_combo_index'],
		toolHints: ['create_onto_document', 'web_research'],
		outputs: [
			'channel positioning',
			'content pillars or games',
			'publishing cadence',
			'video roadmap',
			'known coverage gaps'
		],
		evaluationCriteria: [
			'Strategy distinguishes YouTube from generic content marketing.',
			'Plan is honest about current gaps in analytics and packaging diagnostics.',
			'Recommendations produce a concrete next publishing path.'
		],
		coverageStatus: 'partial',
		gaps: [
			{
				missingSkillId: 'youtube_channel_diagnostics',
				userNeed:
					'diagnose channel growth blockers from analytics, packaging, and content history',
				summary: 'No dedicated YouTube analytics or channel-diagnostics skill exists yet.'
			}
		]
	},
	{
		id: 'youtube_video_improvement',
		name: 'YouTube Video Improvement',
		summary:
			'Improve one YouTube video idea, title, hook, narrative, or script using registered content craft skills.',
		domainIds: ['marketing.youtube_growth', 'marketing.short_form_video', 'creator_growth'],
		buildosCapabilityIds: ['planning', 'documents'],
		whenToUse: [
			'The user has one YouTube video idea, title, hook, outline, or script to improve.',
			'The unit of work is an asset, not a whole-channel strategy.'
		],
		exampleRequests: [
			'Make this YouTube hook stronger.',
			'Rewrite this video outline so retention is better.'
		],
		defaultSkillId: 'viral_video_script_structure',
		skillIds: [
			'hook_craft_short_form',
			'viral_video_script_structure',
			'story_driven_content_craft'
		],
		toolHints: ['create_onto_document'],
		outputs: ['stronger hook', 'improved outline', 'script structure', 'retention notes'],
		evaluationCriteria: [
			'Advice is specific to the supplied asset.',
			'The first seconds, value loop, and structure are all considered.',
			'The output can be used directly in drafting.'
		],
		coverageStatus: 'strong'
	},
	{
		id: 'linkedin_company_page_growth_plan',
		name: 'LinkedIn Company Page Growth Plan',
		summary:
			'Plan or audit LinkedIn Company Page growth across Page hygiene, content, employee advocacy, proof, and measurement.',
		domainIds: ['marketing.linkedin_company_page_growth', 'marketing'],
		buildosCapabilityIds: ['planning', 'documents', 'web_research'],
		whenToUse: [
			'The user asks about a LinkedIn Company Page or company account.',
			'The requested output is a growth plan, audit, calendar, SME map, or measurement system.'
		],
		exampleRequests: [
			'Grow our LinkedIn Company Page.',
			'Audit our LinkedIn Page and create a 30-day content plan.'
		],
		defaultSkillId: 'linkedin_company_page_growth',
		skillIds: ['linkedin_company_page_growth'],
		resourceIds: ['linkedin_company_page_growth.growth_playbook'],
		toolHints: ['create_onto_document', 'web_research'],
		outputs: [
			'Page audit',
			'growth plan',
			'content calendar',
			'employee advocacy motion',
			'measurement plan'
		],
		evaluationCriteria: [
			'Plan distinguishes Company Page growth from personal profile growth.',
			'Distribution includes founder or employee amplification where relevant.',
			'Measurement is tied to reach, engagement, followers, and pipeline-adjacent signals.'
		],
		coverageStatus: 'strong'
	},
	{
		id: 'ui_ux_screen_review',
		name: 'UI/UX Screen Review',
		summary:
			'Review a product screen or flow across structure, hierarchy, visual craft, accessibility, and usability.',
		domainIds: ['product_and_design.ui_ux_quality', 'product_and_design'],
		buildosCapabilityIds: ['planning', 'documents', 'web_research'],
		whenToUse: [
			'The user wants a product screen, flow, screenshot, or interface reviewed.',
			'The request spans UI quality, UX clarity, visual polish, accessibility, or usability.'
		],
		exampleRequests: [
			'Review this screen and tell me what to fix.',
			'Does this dashboard UI feel clear and usable?'
		],
		defaultSkillId: 'build_quality_ui_ux',
		skillIds: [
			'build_quality_ui_ux',
			'information_architecture_review',
			'ui_ux_quality_review',
			'visual_craft_fundamentals',
			'accessibility_inclusive_ui_review'
		],
		toolHints: ['create_onto_document'],
		outputs: [
			'prioritized UI/UX findings',
			'severity and rationale',
			'concrete fixes',
			'optional accessibility/usability notes'
		],
		evaluationCriteria: [
			'Findings are tied to visible or described product evidence.',
			'The review prioritizes the changes that most improve user outcomes.',
			'Visual, structural, accessibility, and usability concerns are not collapsed together.'
		],
		coverageStatus: 'strong'
	},
	{
		id: 'design_system_architecture_review',
		name: 'Design System Architecture Review',
		summary:
			'Review design-system component hierarchy, tokens, governance, adoption, naming, and operational fit.',
		domainIds: ['product_and_design.design_systems', 'product_and_design'],
		buildosCapabilityIds: ['planning', 'documents', 'web_research'],
		whenToUse: [
			'The system of components, tokens, governance, or adoption is the subject.',
			'The user needs design-system architecture rather than one-screen polish.'
		],
		exampleRequests: [
			'Review our design system architecture.',
			'Help me plan component taxonomy and token governance.'
		],
		defaultSkillId: 'design_system_architecture_review',
		skillIds: ['build_quality_ui_ux', 'design_system_architecture_review'],
		toolHints: ['create_onto_document'],
		outputs: [
			'architecture assessment',
			'component and token recommendations',
			'governance risks',
			'adoption plan'
		],
		evaluationCriteria: [
			'Recommendations account for product workflow, not only visual consistency.',
			'Token and component advice is concrete enough to implement.',
			'Governance guidance is proportional to team size and maturity.'
		],
		coverageStatus: 'strong'
	},
	{
		id: 'short_form_video_asset_improvement',
		name: 'Short-Form Video Asset Improvement',
		summary:
			'Improve one short-form video idea, hook, script, retention path, or publishing asset.',
		domainIds: ['marketing.short_form_video', 'marketing.youtube_growth', 'creator_growth'],
		buildosCapabilityIds: ['planning', 'documents'],
		whenToUse: [
			'The user has one short-form video idea, hook, draft, or script to improve.',
			'The request is about TikTok, Reels, Shorts, hooks, retention, or vertical video.'
		],
		exampleRequests: [
			'Make this TikTok hook stronger.',
			'Turn this idea into a short-form video script.'
		],
		defaultSkillId: 'hook_craft_short_form',
		skillIds: [
			'hook_craft_short_form',
			'viral_video_script_structure',
			'story_driven_content_craft'
		],
		toolHints: ['create_onto_document'],
		outputs: ['hook options', 'script structure', 'retention improvements', 'publishing notes'],
		evaluationCriteria: [
			'The opening creates a clear reason to keep watching.',
			'The script has a value loop, not just a topic.',
			'Advice fits the platform and audience implied by the user.'
		],
		coverageStatus: 'strong'
	},
	{
		id: 'content_strategy_plan',
		name: 'Content Strategy Plan',
		summary:
			'Build a content strategy, channel plan, publishing system, or format decision across marketing and creator contexts.',
		domainIds: ['marketing.content_strategy', 'marketing', 'creator_growth'],
		buildosCapabilityIds: ['planning', 'documents', 'web_research'],
		whenToUse: [
			'The user needs a repeatable content system rather than a single asset rewrite.',
			'The request is about channel strategy, content cadence, distribution, or format decisions.'
		],
		exampleRequests: [
			'Create a content strategy for this product.',
			'Help me decide what channels and formats to focus on.'
		],
		defaultSkillId: 'content_strategy_beyond_blogging',
		skillIds: ['content_strategy_beyond_blogging', 'algorithm_aware_publishing'],
		resourceIds: ['youtube_library.marketing_and_content_combo_index'],
		toolHints: ['create_onto_document', 'web_research'],
		outputs: ['content thesis', 'channel selection', 'publishing cadence', 'distribution plan'],
		evaluationCriteria: [
			'The plan starts from audience and positioning before channel tactics.',
			'The channel mix is selective rather than generic.',
			'The cadence is realistic and connected to business or audience goals.'
		],
		coverageStatus: 'strong'
	},
	{
		id: 'project_health_audit',
		name: 'Project Health Audit',
		summary:
			'Assess a BuildOS project for blockers, stale work, risks, gaps, and next actions using project context.',
		domainIds: [],
		buildosCapabilityIds: ['project_audit', 'project_graph', 'planning', 'documents'],
		whenToUse: [
			'The user asks for a project health review, audit, stress test, blockers, or stale work.',
			'The work is BuildOS-native project analysis rather than a specialized subject domain.'
		],
		exampleRequests: [
			'Audit this project and tell me what is blocked.',
			'What is stale or risky in this project?'
		],
		defaultSkillId: 'project_audit',
		skillIds: ['project_audit'],
		toolHints: ['get_project_overview', 'search_project'],
		outputs: ['audit summary', 'blockers', 'risks', 'stale work', 'next actions'],
		evaluationCriteria: [
			'The audit is grounded in loaded project evidence.',
			'Risks and blockers are separated from general observations.',
			'Next actions are concrete and tied to project state.'
		],
		coverageStatus: 'strong',
		notes: ['BuildOS-native outcome card; it does not require an active subject domain.']
	},
	{
		id: 'project_slip_forecast',
		name: 'Project Slip Forecast',
		summary:
			'Forecast likely schedule outcomes, slippage risk, uncertainty drivers, and mitigation priorities from project context.',
		domainIds: [],
		buildosCapabilityIds: ['project_forecast', 'project_graph', 'planning'],
		whenToUse: [
			'The user asks whether project work is on track, likely to slip, delayed, or schedule-risky.',
			'The work is BuildOS-native project forecasting rather than a specialized subject domain.'
		],
		exampleRequests: [
			'Forecast what is likely to slip in this project.',
			'Are we on track for the next milestone?'
		],
		defaultSkillId: 'project_forecast',
		skillIds: ['project_forecast'],
		toolHints: ['get_project_overview', 'search_project'],
		outputs: [
			'forecast summary',
			'likely slippage',
			'uncertainty drivers',
			'schedule risks',
			'mitigation priorities'
		],
		evaluationCriteria: [
			'The forecast is grounded in loaded project evidence.',
			'Slippage risk is tied to tasks, milestones, blockers, or dependencies.',
			'The answer separates likelihood, drivers, and recommended mitigation.'
		],
		coverageStatus: 'strong',
		notes: ['BuildOS-native outcome card; it does not require an active subject domain.']
	}
];

export function listOutcomeCards(): OutcomeCardDefinition[] {
	return [...OUTCOME_CARD_CATALOG];
}

export function getOutcomeCardById(id: string): OutcomeCardDefinition | undefined {
	const normalized = OUTCOME_CARD_ID_ALIASES[id.trim().toLowerCase()] ?? id.trim().toLowerCase();
	return OUTCOME_CARD_CATALOG.find((capability) => capability.id === normalized);
}

export function listOutcomeCardsForDomain(domainId: string): OutcomeCardDefinition[] {
	const normalized = domainId.trim().toLowerCase();
	if (!normalized) return [];
	return OUTCOME_CARD_CATALOG.filter((capability) =>
		capability.domainIds.includes(normalized)
	).sort((a, b) => a.id.localeCompare(b.id));
}
