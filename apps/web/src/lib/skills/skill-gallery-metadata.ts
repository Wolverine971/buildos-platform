// apps/web/src/lib/skills/skill-gallery-metadata.ts
import type {
	DomainGuide,
	PackDefinition,
	RuntimeSkillPreviewMetadata,
	SkillGalleryMetadata
} from './skill-gallery-types';

export const domainGuides: DomainGuide[] = [
	{
		id: 'marketing-and-content',
		name: 'Marketing And Content',
		shortName: 'Marketing',
		description: 'Hooks, stories, brand content, landing pages, and conversion paths.',
		promise: 'Turn attention into trust and qualified action.',
		startSlug: 'hook-craft-short-form',
		path: [
			'Choose the audience moment',
			'Shape the hook',
			'Build the story',
			'Route the next action'
		]
	},
	{
		id: 'sales-and-growth',
		name: 'Sales And Growth',
		shortName: 'Growth',
		description: 'ICP definition, signal design, cold outreach, and lead capture.',
		promise: 'Find the right person, make the right ask, and route replies cleanly.',
		startSlug: 'cold-email-engagement-first-outreach',
		path: [
			'Define ICP and signal',
			'Choose outreach mode',
			'Draft the artifact ask',
			'Prepare reply routes'
		]
	},
	{
		id: 'product-and-design',
		name: 'Product And Design',
		shortName: 'Design',
		description: 'Interface audits, UX quality checks, and product polish loops.',
		promise: 'Audit a surface the way a senior product designer would.',
		startSlug: 'ui-ux-quality-review',
		path: [
			'Map the surface',
			'Check hierarchy',
			'Audit interaction',
			'Write fixes an agent can run'
		]
	},
	{
		id: 'google-workspace',
		name: 'Google Workspace',
		shortName: 'Workspace',
		description:
			'Provider skills that make agents safer around calendars and collaboration tools.',
		promise: 'Operate connected work tools without duplicate or destructive actions.',
		startSlug: 'google-calendar-for-ai-agents-search-before-you-create',
		path: ['Pick scope', 'Search first', 'Use exact IDs', 'Treat recurrence as high risk']
	},
	{
		id: 'planning-and-ops',
		name: 'Planning And Ops',
		shortName: 'Planning',
		description:
			'Project setup, plans, tasks, documents, audits, and forecasts for durable execution.',
		promise:
			'Turn a messy initiative into structured work that stays understandable over time.',
		startPreviewRuntimeId: 'project_creation',
		path: ['Frame the project', 'Plan the work', 'Operate tasks and docs', 'Audit and forecast']
	}
];

export const packDefinitions: PackDefinition[] = [
	{
		id: 'cold-outreach-pack',
		name: 'Cold Outreach Pack',
		kind: 'Pack',
		job: 'Launch or repair outbound without turning into template spam.',
		description:
			'Segment first, draft the outreach, and connect the offer to a conversion surface.',
		slugs: [
			'cold-email-icp-signal-design',
			'cold-email-engagement-first-outreach',
			'landing-page-scorecard-funnel'
		],
		order: ['ICP and signal', 'Engagement-first email', 'Scorecard funnel'],
		tryPrompt:
			'Help me launch or repair this outbound campaign. Start by checking the ICP and buying signal, then build the outreach, then verify the conversion path.',
		handoff: [
			'Carry the approved segment and buying signal into the outreach stage.',
			'Carry the offer, researched bridge, and reply route into the conversion-path stage.',
			'Pause for human approval before any sending or external action.'
		]
	},
	{
		id: 'founder-content-pack',
		name: 'Founder Content Pack',
		kind: 'Pack',
		job: 'Make founder, brand, and product ideas harder to scroll past.',
		description: 'Start with the opener, build the narrative, then audit brand-account fit.',
		slugs: [
			'hook-craft-short-form',
			'story-driven-content-craft',
			'viral-content-for-boring-brands'
		],
		order: ['Hook', 'Story', 'Brand filter'],
		tryPrompt:
			'Help me turn this founder or product idea into content. Develop the opening hook, shape the story, then audit whether the final piece fits the brand and audience.',
		handoff: [
			'Carry the chosen hook and its promised payoff into the story stage.',
			'Carry the completed narrative into the brand-fit review without changing its core claim.',
			'Return one publishable draft plus the rejected alternatives and reasons.'
		]
	},
	{
		id: 'landing-page-improvement-stack',
		name: 'Landing Page Improvement Stack',
		kind: 'Stack',
		job: 'Move from page critique to a concrete conversion rebuild.',
		description:
			'Audit the interface, sharpen the scorecard path, then connect the follow-up skills.',
		slugs: ['ui-ux-quality-review', 'landing-page-scorecard-funnel', 'hook-craft-short-form'],
		order: ['UX review', 'Scorecard funnel', 'Opening hook'],
		tryPrompt:
			'Help me improve this landing page as an ordered workflow: audit the UI and UX, rebuild the scorecard conversion path, then sharpen the opening hook.',
		handoff: [
			'Convert the UX audit into explicit constraints for the funnel rebuild.',
			'Carry the scorecard promise and qualification logic into the hook stage.',
			'Finish with a prioritized implementation brief, not three disconnected reports.'
		]
	},
	{
		id: 'agent-ops-starter-pack',
		name: 'Agent Ops Starter Pack',
		kind: 'Pack',
		job: 'Give agents practical operating rules before they touch external systems.',
		description: 'A compact starting point for safe, search-first connected-tool behavior.',
		slugs: ['google-calendar-for-ai-agents-search-before-you-create'],
		order: ['Calendar safety'],
		tryPrompt:
			'Help me plan this calendar action safely. Search before creating, confirm exact event scope, and call out recurrence or time-zone risks before any mutation.',
		handoff: [
			'Return the proposed action and the evidence used to avoid duplicates.',
			'Pause for confirmation before creating, updating, or deleting calendar data.'
		]
	}
];

/**
 * Explicitly reviewed runtime-only skills that are safe to describe publicly.
 * Every runtime skill not represented by a published gallery post or this map
 * remains internal by default.
 */
export const previewSkillMetadataByRuntimeId: Record<string, RuntimeSkillPreviewMetadata> = {
	cold_email_offer_lab: {
		displayTitle: 'Cold Email Offer Lab',
		description: 'Design the smallest useful cold-outreach offer before any copy is written.',
		domainId: 'sales-and-growth',
		family: 'Cold Outreach',
		outputShapes: ['artifact offer', 'trust-tier ruling', 'backup tests'],
		workflow: [
			'Name the outreach mode and buyer moment.',
			'Separate the core offer from the front-end artifact.',
			'Size the ask to the current trust level.',
			'Run production-cost and false-positive checks.'
		],
		useCases: [
			'Replace a meeting-first cold ask with a useful artifact.',
			'Repair an offer that is too large for a stranger.',
			'Compare artifact hypotheses before drafting copy.'
		],
		guardrails: [
			'Do not disguise a pitch deck or calendar link as an artifact.',
			'Do not make claims without approved proof.',
			'Do not let the ask outrun the trust already earned.'
		],
		starterPrompts: [
			'Help me turn this meeting-first cold email offer into the smallest useful artifact ask.',
			'Audit these outreach offer ideas and recommend the strongest low-trust option.'
		],
		lastUpdated: '2026-07-10'
	},
	cold_email_research_anchors: {
		displayTitle: 'Cold Email Research Anchors',
		description:
			'Find a specific, public reason to email one person and connect it to the ask.',
		domainId: 'sales-and-growth',
		family: 'Cold Outreach',
		outputShapes: ['research anchor', 'specificity grade', 'causal bridge'],
		workflow: [
			'Choose one named, high-value recipient.',
			'Find a specific and verifiable public anchor.',
			'Grade specificity and check the original context.',
			'Write a bridge that makes the anchor cause the email.'
		],
		useCases: [
			'Research a strategic prospect before drafting outreach.',
			'Repair decorative personalization.',
			'Check whether a research hook feels invasive or irrelevant.'
		],
		guardrails: [
			'Use professional, public information only.',
			'Do not imply familiarity or access you do not have.',
			'Discard anchors that fail the original-context check.'
		],
		starterPrompts: [
			'Help me find and grade a real research anchor for this named prospect.',
			'Audit this personalization line and rewrite the bridge so it causes the email.'
		],
		lastUpdated: '2026-07-10'
	},
	cold_email_outreach_compiler: {
		displayTitle: 'Cold Email Outreach Compiler',
		description:
			'Compile approved research, offer, proof, and mode constraints into one email.',
		domainId: 'sales-and-growth',
		family: 'Cold Outreach',
		outputShapes: ['mode-aware email draft', 'CTA choice', 'pre-send checklist'],
		workflow: [
			'Confirm the outreach mode and approved inputs.',
			'Choose the opening structure and single CTA.',
			'Compile one concise draft without inventing proof.',
			'Run the pre-send checks and expose missing inputs.'
		],
		useCases: [
			'Turn approved campaign inputs into a final draft.',
			'Adapt an email to strategic, recruiting, investor, or PR mode.',
			'Diagnose why a draft has too many asks or unsupported claims.'
		],
		guardrails: [
			'Do not invent research, proof, or recipient facts.',
			'Do not combine multiple outreach modes.',
			'Do not send the compiled message automatically.'
		],
		starterPrompts: [
			'Compile these approved outreach inputs into one concise email with a single CTA.',
			'Audit this draft against its outreach mode and pre-send requirements.'
		],
		lastUpdated: '2026-07-10'
	},
	cold_email_taste_review: {
		displayTitle: 'Cold Email Taste Review',
		description: 'Review a cold email for credibility, restraint, and recipient respect.',
		domainId: 'sales-and-growth',
		family: 'Cold Outreach',
		outputShapes: ['taste audit', 'risk flags', 'rewrite brief'],
		workflow: [
			'Read the email from the recipient point of view.',
			'Flag pressure, imitation, vagueness, and credibility gaps.',
			'Preserve the useful claim while removing performative language.',
			'Return a prioritized rewrite brief.'
		],
		useCases: [
			'Run a final editorial review before outreach.',
			'Repair a draft that feels templated or overfamiliar.',
			'Tighten tone without erasing the concrete offer.'
		],
		guardrails: [
			'Do not mistake aggressive certainty for credibility.',
			'Do not add fake warmth or familiarity.',
			'Do not approve language that hides the real ask.'
		],
		starterPrompts: [
			'Review this cold email for taste, credibility, and recipient respect.',
			'Turn these taste-review flags into a concise rewrite brief.'
		],
		lastUpdated: '2026-07-10'
	},
	cold_email_deliverability_readiness: {
		displayTitle: 'Cold Email Deliverability Readiness',
		description:
			'Check sender, list, provider, and compliance readiness before a campaign starts.',
		domainId: 'sales-and-growth',
		family: 'Cold Outreach',
		outputShapes: ['readiness verdict', 'provider checklist', 'remediation plan'],
		workflow: [
			'Identify the sending provider, volume, and audience.',
			'Check authentication, list hygiene, and complaint risk.',
			'Separate infrastructure issues from copy issues.',
			'Return a go, repair, or stop verdict.'
		],
		useCases: [
			'Audit a campaign before the first send.',
			'Diagnose low placement or elevated bounce risk.',
			'Create a remediation checklist for a sending domain.'
		],
		guardrails: [
			'Do not treat copy changes as a fix for infrastructure failure.',
			'Do not send to unverified or improperly sourced lists.',
			'Do not continue when trust or provider thresholds require a stop.'
		],
		starterPrompts: [
			'Audit this cold email campaign for deliverability readiness before we send.',
			'Help me separate infrastructure, list, and copy causes behind these campaign metrics.'
		],
		lastUpdated: '2026-07-10'
	},
	cold_email_reply_os: {
		displayTitle: 'Cold Email Reply OS',
		description:
			'Classify cold-email replies and choose a respectful next step for each route.',
		domainId: 'sales-and-growth',
		family: 'Cold Outreach',
		outputShapes: ['reply classification', 'response draft', 'follow-up rule'],
		workflow: [
			'Classify the reply before writing a response.',
			'Choose the matching route and intent level.',
			'Draft one answer, artifact, or calibrated next step.',
			'Log the buyer language and stop rule.'
		],
		useCases: [
			'Respond to interested, skeptical, or send-info replies.',
			'Route objections without counter-pitching.',
			'Set a respectful rule for silence, opt-out, or revival.'
		],
		guardrails: [
			'Honor a no or opt-out immediately.',
			'Do not pressure a weak-interest reply into a call.',
			'Do not respond before classifying the reply.'
		],
		starterPrompts: [
			'Classify this cold email reply and draft the safest useful next response.',
			'Help me route these replies and capture the buyer language we should learn from.'
		],
		lastUpdated: '2026-07-10'
	},
	cold_email_learning_review: {
		displayTitle: 'Cold Email Learning Review',
		description:
			'Turn campaign results and buyer language into the next evidence-based decision.',
		domainId: 'sales-and-growth',
		family: 'Cold Outreach',
		outputShapes: ['campaign diagnosis', 'gate decision', 'learning memo'],
		workflow: [
			'Gather raw counts by variant and persona.',
			'Check trust and sample validity before reading rates.',
			'Diagnose one failing layer and extract buyer language.',
			'Decide whether to stop, iterate, recycle, or scale.'
		],
		useCases: [
			'Review a completed cold outreach test.',
			'Decide whether a campaign is ready to scale.',
			'Convert objections and replies into the next controlled test.'
		],
		guardrails: [
			'Do not optimize a composite reply rate.',
			'Do not make a rate verdict from an invalid sample.',
			'Do not scale through a trust, bounce, or complaint failure.'
		],
		starterPrompts: [
			'Review these campaign counts and tell me whether to stop, iterate, recycle, or scale.',
			'Turn these replies, objections, and metrics into a concise learning memo.'
		],
		lastUpdated: '2026-07-10'
	},
	build_quality_ui_ux: {
		displayTitle: 'Build Quality UI/UX',
		description:
			'Route a UI or UX problem to the right review lenses and sequence structure before polish.',
		domainId: 'product-and-design',
		family: 'Interface Quality',
		familyStart: true,
		outputShapes: ['review routing plan', 'sequenced lens brief', 'evidence-level report'],
		workflow: [
			'Classify the surface and the outcome the user needs.',
			'Choose one primary review lens and at most two secondary lenses.',
			'Sequence structure, evidence, accessibility, craft, and verification.',
			'Return the requested audit, redesign, or implementation artifact.'
		],
		useCases: [
			'Choose the right review workflow for a product surface.',
			'Sequence a multi-lens UI or UX audit.',
			'Plan a design-quality review without loading every specialist procedure.'
		],
		guardrails: [
			'Do not flatten every interface problem into visual polish.',
			'Do not load every review lens by default.',
			'Do not claim rendered behavior was verified from static code alone.'
		],
		starterPrompts: [
			'Route this interface problem to the right review lenses and sequence the work.',
			'Help me plan a structure-to-polish quality review for this product surface.'
		],
		lastUpdated: '2026-07-10'
	},
	visual_craft_fundamentals: {
		displayTitle: 'Visual Craft Fundamentals',
		description:
			'Turn a functional interface into a more deliberate one using evidence-backed craft techniques.',
		domainId: 'product-and-design',
		family: 'Interface Quality',
		outputShapes: ['visual craft audit', 'ranked token fixes', 'delegated findings'],
		workflow: [
			'Confirm the foundational flow and hierarchy already work.',
			'Check vetted references before proposing a new layout pattern.',
			'Audit typography, spacing, emphasis, depth, color, and image treatment.',
			'Rank concrete fixes by severity and perceived polish gain.'
		],
		useCases: [
			'Polish a functional screen that still feels generic.',
			'Repair common AI-generated interface patterns.',
			'Turn visual feedback into concrete token-level changes.'
		],
		guardrails: [
			'Do not decorate a broken flow before fixing its foundation.',
			'Do not produce a finding without specific evidence.',
			'Do not invent parallel design-token scales or reduce accessibility.'
		],
		starterPrompts: [
			'Audit this working interface for visual craft and rank the five highest-impact fixes.',
			'Help me remove the generic AI-generated feel from this screen using concrete token changes.'
		],
		lastUpdated: '2026-07-10'
	},
	accessibility_inclusive_ui_review: {
		displayTitle: 'Accessibility And Inclusive UI Review',
		description:
			'Audit a screen and its component patterns for semantic, keyboard, focus, and assistive-technology failures.',
		domainId: 'product-and-design',
		family: 'Interface Quality',
		outputShapes: ['accessibility findings', 'WCAG evidence map', 'primitive fix list'],
		workflow: [
			'Run a screen-level accessibility pass on the core flow.',
			'Run a component-pattern pass on the primitives in use.',
			'Classify each finding by WCAG criterion, evidence, and severity.',
			'Prioritize reusable primitive fixes and human-review items.'
		],
		useCases: [
			'Audit a route, form, dialog, menu, table, or custom control.',
			'Diagnose keyboard, focus, contrast, or screen-reader problems.',
			'Review a design-system primitive before it propagates.'
		],
		guardrails: [
			'Do not replace semantic HTML with unnecessary ARIA.',
			'Do not remove visible focus indicators or rely on color alone.',
			'Do not call a screen accessible; report evidence and remaining judgment.'
		],
		starterPrompts: [
			'Audit this screen for keyboard, focus, semantics, contrast, and dynamic-content risks.',
			'Review this component primitive and identify the highest-leverage inclusive fix.'
		],
		lastUpdated: '2026-07-10'
	},
	marketing_site_design_review: {
		displayTitle: 'Marketing Site Design Review',
		description:
			'Review a marketing page section by section for offer clarity, proof, trust, and conversion.',
		domainId: 'product-and-design',
		family: 'Interface Quality',
		outputShapes: ['section audit', 'conversion fix list', 'effort consistency score'],
		workflow: [
			'Name the page goal, audience, promise, primary action, and proof standard.',
			'Run the site-wide foundation checks once.',
			'Review each present section from hero through the tail.',
			'Rank fixes by conversion impact and delegate out-of-scope findings.'
		],
		useCases: [
			'Audit a homepage, pricing page, comparison page, or launch page.',
			'Diagnose why a marketing page underperforms despite useful traffic.',
			'Review one weak section without redesigning the entire site.'
		],
		guardrails: [
			'Do not judge a selling page only as an in-app interface.',
			'Do not recommend a redesign when section-level fixes are enough.',
			'Do not fabricate proof, generic taglines, or decorative fixes.'
		],
		starterPrompts: [
			'Audit this marketing page section by section and rank the conversion fixes.',
			'Review this hero for audience clarity, concrete offer, proof, and primary action.'
		],
		lastUpdated: '2026-07-10'
	},
	information_architecture_review: {
		displayTitle: 'Information Architecture Review',
		description:
			'Map a confusing interface or flow and fix its conceptual model, labels, wayfinding, feedback, and recovery.',
		domainId: 'product-and-design',
		family: 'Interface Quality',
		outputShapes: ['structural map', 'IA findings', 'flow repair plan'],
		workflow: [
			'State the user goal and the interface conceptual model.',
			'Map the primary flow from entry to completion.',
			'Apply the structure, label, affordance, wayfinding, feedback, and recovery lenses.',
			'Lead with structural fixes and delegate cosmetic residue.'
		],
		useCases: [
			'Diagnose a flow that looks acceptable but feels confusing.',
			'Review navigation, labels, affordances, and recovery paths.',
			'Build a structural map before a redesign begins.'
		],
		guardrails: [
			'Do not start with color or spacing when the conceptual model is broken.',
			'Do not expose implementation terminology as user-facing structure.',
			'Do not include findings without specific evidence and a named lens.'
		],
		starterPrompts: [
			'Map this confusing flow and identify the structural fixes before visual polish.',
			'Audit these labels, affordances, wayfinding, feedback, and recovery paths.'
		],
		lastUpdated: '2026-07-10'
	},
	calm_software_design_review: {
		displayTitle: 'Calm Software Design Review',
		description:
			'Audit cognitively demanding software for attention cost, manufactured engagement, notification load, and avoidable surface noise.',
		domainId: 'product-and-design',
		family: 'Interface Quality',
		outputShapes: ['calm-surface audit', 'subtraction-first fixes', 'calm-vs-delight verdict'],
		workflow: [
			'Confirm the surface, audience state, and whether calm is the right product school.',
			'Check motion, surface count, attention cost, defaults, notifications, states, and tone.',
			'Run the door and disappearance tests, putting subtraction before additions.',
			'Prioritize evidence-backed fixes and return a calm-vs-delight verdict.'
		],
		useCases: [
			'Review a productivity or knowledge tool for distraction and anxiety.',
			'Reduce notification fatigue, manufactured urgency, or gamification pressure.',
			'Triage a feature list into main-quest work and attention-costly side quests.'
		],
		guardrails: [
			'Do not apply calm-software rules to entertainment products whose users arrive under-stimulated.',
			'Do not recommend animation, badges, or streaks as a substitute for product quality.',
			'Do not produce findings without evidence from a specific surface, message, or roadmap item.'
		],
		starterPrompts: [
			'Audit this product flow for attention cost, manufactured engagement, and unnecessary surface noise.',
			'Review this roadmap through a calm-software lens and put subtraction-first fixes in priority order.'
		],
		lastUpdated: '2026-07-10'
	},
	delightful_product_review: {
		displayTitle: 'Delightful Product Review',
		description:
			'Find and gate product-delight opportunities that serve real functional and emotional needs without covering broken basics.',
		domainId: 'product-and-design',
		family: 'Interface Quality',
		outputShapes: ['motivator map', 'delight opportunity grid', 'pre-ship gate'],
		workflow: [
			'Confirm delight is appropriate for the audience and foundational usability is already sound.',
			'Map functional, personal-emotional, and social-emotional motivators.',
			'Place opportunities on the low, surface, deep, or anti-delight grid.',
			'Gate ship-bound ideas for inclusion, feasibility, impact, familiarity, and durability.'
		],
		useCases: [
			'Find meaningful delight opportunities in onboarding, empty states, or achievement moments.',
			'Review a celebration, recap, animation, or personalization concept before launch.',
			'Diagnose why a feature intended to feel delightful landed flat.'
		],
		guardrails: [
			'Do not use delight to cover broken flows, weak hierarchy, or missing states.',
			'Do not recommend context-blind or default-on celebrations.',
			'Do not gamify products used under cognitive load or in burnout-, grief-, or ADHD-adjacent contexts.'
		],
		starterPrompts: [
			'Find the strongest deep-delight opportunities in this journey and reject the anti-delight ideas.',
			'Gate this celebration feature before ship for inclusion, context, impact, and habituation risk.'
		],
		lastUpdated: '2026-07-10'
	},
	design_system_architecture_review: {
		displayTitle: 'Design System Architecture Review',
		description:
			'Review the product outcomes, taxonomy, tokens, governance, adoption, and migration model behind a design system.',
		domainId: 'product-and-design',
		family: 'Interface Quality',
		outputShapes: ['system architecture map', 'adoption diagnosis', 'migration plan'],
		workflow: [
			'Name the product outcomes the system must make faster, safer, clearer, or more coherent.',
			'Map atomic layers and test whether products and the system inform each other.',
			'Review token tiers, component taxonomy, ownership, releases, intake, and accessibility.',
			'Choose an evidence-backed migration path and next operating change.'
		],
		useCases: [
			'Audit a component library or token system before expanding it.',
			'Diagnose why teams are not adopting an existing design system.',
			'Plan a flow-by-flow migration from duplicated UI patterns.'
		],
		guardrails: [
			'Do not treat a design system as a component inventory without adoption and operations.',
			'Do not standardize components before running or referencing an interface inventory.',
			'Do not recommend raw-token consumption, governance theater, or component-by-component migration by default.'
		],
		starterPrompts: [
			'Audit this design system for product outcomes, adoption gaps, taxonomy, governance, and migration risk.',
			'Diagnose why this component library is not being adopted and propose the next operating change.'
		],
		lastUpdated: '2026-07-10'
	},
	usability_quick_research: {
		displayTitle: 'Usability Quick Research',
		description:
			'Right-size user research around the decision, bet size, highest-risk unknown, and smallest credible method.',
		domainId: 'product-and-design',
		family: 'Interface Quality',
		outputShapes: ['decision-first research plan', 'neutral test script', 'evidence synthesis'],
		workflow: [
			'Name the decision, current belief, success condition, and evidence that would change the team’s mind.',
			'Size the bet from reversibility, cost of being wrong, and existing knowledge.',
			'Rank unknowns and select the smallest credible qualitative or quantitative method.',
			'Prepare neutral prompts, representative participants, analysis rules, and stop conditions.'
		],
		useCases: [
			'Plan a lightweight usability or prototype test.',
			'Reduce decision risk without creating a large research program.',
			'Rewrite leading interview questions into prompts that can disconfirm a hypothesis.'
		],
		guardrails: [
			'Do not choose a method before naming the decision, bet size, and unknowns.',
			'Do not structure research to validate a decision that is already made.',
			'Do not treat three users as sufficient for expensive, hard-to-reverse decisions.'
		],
		starterPrompts: [
			'Right-size a research plan for this product decision and its highest-risk unknown.',
			'Turn these leading questions into a neutral three-user usability test with explicit stop conditions.'
		],
		lastUpdated: '2026-07-10'
	},
	content_strategy_beyond_blogging: {
		displayTitle: 'Content Strategy Beyond Blogging',
		description:
			'Build a durable content strategy around intent, identity, distribution, and point of view.',
		domainId: 'marketing-and-content',
		family: 'Content Craft',
		familyStart: true,
		outputShapes: ['content strategy', 'point-of-view map', 'distribution plan'],
		workflow: [
			'Name the audience, business intent, and durable point of view.',
			'Choose the content jobs and formats that support that intent.',
			'Map distribution before expanding the production calendar.',
			'Return a focused strategy with explicit exclusions and measures.'
		],
		useCases: [
			'Replace generic blog volume with a focused content system.',
			'Plan founder-led or agent-assisted publishing around a point of view.',
			'Choose content formats and distribution based on intent.'
		],
		guardrails: [
			'Do not confuse publishing volume with strategy.',
			'Do not choose formats before the audience and intent are clear.',
			'Do not automate away the lived point of view that makes the work distinct.'
		],
		starterPrompts: [
			'Help me build a content strategy around this audience, business intent, and point of view.',
			'Audit this content plan for generic volume, weak distribution, and missing identity.'
		],
		lastUpdated: '2026-07-10'
	},
	content_creation_pipeline: {
		displayTitle: 'Content Creation Pipeline',
		description:
			'Turn one chosen idea into a ship-ready draft through explicit creative stages and handoffs.',
		domainId: 'marketing-and-content',
		family: 'Content Craft',
		outputShapes: ['ship-ready draft', 'stage handoffs', 'quality checklist'],
		workflow: [
			'Confirm the chosen idea, audience, intent, and target medium.',
			'Choose the right idea-shaping lens before drafting.',
			'Draft the piece, then reinforce its load-bearing beats.',
			'Tailor the approved draft to the target medium and run final checks.'
		],
		useCases: [
			'Turn a half-formed idea into a complete post, video, or essay.',
			'Coordinate idea shaping, drafting, enhancement, and tailoring.',
			'Repair a creation process that jumps straight from idea to publish.'
		],
		guardrails: [
			'Do not use the pipeline to choose a broad channel strategy.',
			'Do not run every shaping lens on one idea.',
			'Do not tailor for a medium before the core draft is approved.'
		],
		starterPrompts: [
			'Take this chosen idea through a structured path to a ship-ready draft.',
			'Help me identify which creation stage is blocking this piece and continue from there.'
		],
		lastUpdated: '2026-07-10'
	},
	idea_expansion_lens: {
		displayTitle: 'Idea Expansion Lens',
		description:
			'Expand one claim into a labeled set of distinct angles before committing to a draft.',
		domainId: 'marketing-and-content',
		family: 'Content Craft',
		outputShapes: ['angle spread', 'labeled candidates', 'selection brief'],
		workflow: [
			'State the original claim and the audience it should serve.',
			'Generate meaningfully different angles instead of paraphrases.',
			'Label each angle by its promise, evidence need, and likely format.',
			'Recommend the strongest path and explain the tradeoff.'
		],
		useCases: [
			'Find new angles around one useful idea.',
			'Break out of repetitive takes before drafting.',
			'Compare candidate directions for a post, essay, or video.'
		],
		guardrails: [
			'Do not treat reworded headlines as distinct angles.',
			'Do not draft the full piece before an angle is selected.',
			'Do not recommend an angle whose evidence the creator cannot support.'
		],
		starterPrompts: [
			'Expand this idea into distinct, labeled angles and recommend the strongest one.',
			'Help me find a less obvious path for this claim before I draft it.'
		],
		lastUpdated: '2026-07-10'
	},
	storyboard_journey_lens: {
		displayTitle: 'Storyboard Journey Lens',
		description:
			'Map the audience journey and choose the strongest entry point for a story-driven piece.',
		domainId: 'marketing-and-content',
		family: 'Content Craft',
		outputShapes: ['journey map', 'entry-point options', 'story spine'],
		workflow: [
			'Name how the audience arrives and what changes by the end.',
			'Map the meaningful moments, decisions, and shifts in the journey.',
			'Generate entry points with different tension and context tradeoffs.',
			'Select the story spine before handing off to narrative drafting.'
		],
		useCases: [
			'Find the shape of a founder or customer story.',
			'Choose where to enter a story without overloading the setup.',
			'Map an experience before writing narrative prose.'
		],
		guardrails: [
			'Do not invent events or emotional stakes.',
			'Do not confuse a chronological list with a story journey.',
			'Do not draft the prose before the entry point and change are clear.'
		],
		starterPrompts: [
			'Map the audience journey in this story and recommend the strongest entry point.',
			'Help me find the story spine inside this sequence of events.'
		],
		lastUpdated: '2026-07-10'
	},
	lived_conviction_lens: {
		displayTitle: 'Lived Conviction Lens',
		description:
			'Find an earned belief in lived experience, the proof behind it, and the bridge to the reader.',
		domainId: 'marketing-and-content',
		family: 'Content Craft',
		outputShapes: ['earned belief', 'proof inventory', 'reader bridge'],
		workflow: [
			'Identify the lived experience and the belief it earned.',
			'Separate observed proof from hindsight or borrowed opinion.',
			'Name the reader situation where the belief becomes useful.',
			'Return a defensible angle and bridge for the drafting stage.'
		],
		useCases: [
			'Turn hard-won experience into a useful content angle.',
			'Find the authority behind a founder opinion.',
			'Repair a piece that sounds borrowed or generic.'
		],
		guardrails: [
			'Do not manufacture vulnerability or certainty.',
			'Do not treat an opinion as earned without supporting experience.',
			'Do not draft the full essay inside the angle-finding step.'
		],
		starterPrompts: [
			'Help me find the earned belief and reader bridge inside this lived experience.',
			'Audit this opinion and identify what proof would make it genuinely mine.'
		],
		lastUpdated: '2026-07-10'
	},
	framework_extraction_lens: {
		displayTitle: 'Framework Extraction Lens',
		description:
			'Turn a messy practice or example into a named, repeatable framework with transferable principles.',
		domainId: 'marketing-and-content',
		family: 'Content Craft',
		outputShapes: ['named framework', 'principle set', 'teaching outline'],
		workflow: [
			'Define the practice, example, or result being examined.',
			'Separate repeatable moves from context-specific details.',
			'Name the steps, principles, and boundaries of the framework.',
			'Return a teaching outline with evidence and failure cases.'
		],
		useCases: [
			'Systematize tacit knowledge into a teachable method.',
			'Extract transferable principles from a success or failure.',
			'Create a framework-shaped angle before drafting.'
		],
		guardrails: [
			'Do not force every example into a neat acronym.',
			'Do not present context-specific luck as a repeatable rule.',
			'Do not omit the conditions where the framework fails.'
		],
		starterPrompts: [
			'Extract a named, repeatable framework from this messy practice.',
			'Tear down this example and separate transferable principles from context.'
		],
		lastUpdated: '2026-07-10'
	},
	sensory_double_tap: {
		displayTitle: 'Sensory Double-Tap',
		description:
			'Reinforce the load-bearing beats of an approved draft through a second sensory channel.',
		domainId: 'marketing-and-content',
		family: 'Content Craft',
		outputShapes: ['reinforcement plan', 'visual cues', 'load-bearing beat map'],
		workflow: [
			'Confirm the draft spine and target medium are already approved.',
			'Identify the beats that carry comprehension, proof, or emotion.',
			'Match each selected beat to a useful visual, demo, diagram, or example.',
			'Reject additions that decorate without reinforcing meaning.'
		],
		useCases: [
			'Add visuals or demonstrations to an approved draft.',
			'Make an abstract explanation easier to grasp.',
			'Plan supporting imagery around the most important beats.'
		],
		guardrails: [
			'Do not use this step to rewrite the core draft or opening hook.',
			'Do not add visuals that repeat without clarifying or proving.',
			'Do not propose media the target format cannot carry.'
		],
		starterPrompts: [
			'Identify the load-bearing beats in this approved draft and plan a sensory double-tap.',
			'Help me choose where a visual, demo, diagram, or concrete example adds real meaning.'
		],
		lastUpdated: '2026-07-10'
	},
	medium_tailoring: {
		displayTitle: 'Medium Tailoring',
		description:
			'Reshape an approved draft into one target medium’s native form without losing its core claim.',
		domainId: 'marketing-and-content',
		family: 'Content Craft',
		outputShapes: ['platform-native draft', 'format adaptations', 'amplification checklist'],
		workflow: [
			'Confirm the approved draft, target medium, audience, and publishing goal.',
			'Map the medium’s native structure, length, and presentation constraints.',
			'Reshape the draft while preserving its claim, proof, and payoff.',
			'Apply medium-specific amplification checks and return the adapted piece.'
		],
		useCases: [
			'Adapt an approved piece for LinkedIn, Instagram, X, YouTube, a blog, or a newsletter.',
			'Preserve one core idea across different native formats.',
			'Diagnose why a cross-post feels copied instead of platform-native.'
		],
		guardrails: [
			'Do not use this step to choose the overall channel strategy.',
			'Do not change the core claim merely to mimic a platform trend.',
			'Do not tailor an unapproved or structurally incomplete draft.'
		],
		starterPrompts: [
			'Tailor this approved draft to the target medium while preserving its core claim.',
			'Audit this adaptation and show where it still feels copied instead of platform-native.'
		],
		lastUpdated: '2026-07-10'
	},
	project_creation: {
		displayTitle: 'Project Creation',
		description:
			'Turn an early idea into the smallest coherent BuildOS project without inventing unnecessary structure.',
		domainId: 'planning-and-ops',
		family: 'Project Operations',
		familyStart: true,
		outputShapes: ['project brief', 'minimum project payload', 'initial structure'],
		workflow: [
			'Clarify the intended outcome, constraints, and current evidence.',
			'Distinguish what belongs in the project now from what can wait.',
			'Draft the minimum viable project payload and initial structure.',
			'Ask for confirmation before creating or mutating project data.'
		],
		useCases: [
			'Turn a rough initiative into a new project.',
			'Recover the essential structure from an overlong project brief.',
			'Prepare a project payload for review before creation.'
		],
		guardrails: [
			'Do not create a project until the user confirms the proposed payload.',
			'Do not manufacture dates, owners, or requirements.',
			'Do not overbuild plans, tasks, or documents during initial framing.'
		],
		starterPrompts: [
			'Help me turn this idea into the smallest useful BuildOS project.',
			'Draft a project brief and initial structure for review before anything is created.'
		],
		lastUpdated: '2026-07-10'
	},
	project_audit: {
		displayTitle: 'Project Audit',
		description:
			'Inspect project structure and evidence, then prioritize the risks and gaps that matter most.',
		domainId: 'planning-and-ops',
		family: 'Project Operations',
		outputShapes: ['structure audit', 'risk register', 'prioritized recommendations'],
		workflow: [
			'Define the audit question and inspect the available project evidence.',
			'Check outcomes, plans, tasks, documents, ownership, and dependencies.',
			'Separate observed facts from inferences and unknowns.',
			'Rank the highest-leverage corrections and explain the evidence behind them.'
		],
		useCases: [
			'Diagnose why a project feels stalled or incoherent.',
			'Find missing ownership, dependencies, or decision records.',
			'Prepare a project health review before replanning.'
		],
		guardrails: [
			'Do not present missing evidence as a confirmed problem.',
			'Do not rewrite project data during an audit without approval.',
			'Do not bury critical risks inside an undifferentiated checklist.'
		],
		starterPrompts: [
			'Audit this project and prioritize the structural risks blocking progress.',
			'Review this project for missing ownership, evidence, dependencies, and decisions.'
		],
		lastUpdated: '2026-07-10'
	},
	project_forecast: {
		displayTitle: 'Project Forecast',
		description:
			'Forecast project trajectory from current evidence, explicit assumptions, and schedule risks.',
		domainId: 'planning-and-ops',
		family: 'Project Operations',
		outputShapes: ['trajectory forecast', 'assumptions map', 'next strategic moves'],
		workflow: [
			'Identify the forecast horizon, target outcome, and available evidence.',
			'Map dependencies, pace, unresolved decisions, and capacity constraints.',
			'Build scenarios with explicit assumptions and confidence levels.',
			'Recommend the next moves that most improve the likely trajectory.'
		],
		useCases: [
			'Assess whether a project is likely to hit a milestone.',
			'Compare best-case, expected, and risk scenarios.',
			'Choose interventions when a project may slip.'
		],
		guardrails: [
			'Do not claim certainty when the project evidence is incomplete.',
			'Do not invent progress, capacity, or delivery dates.',
			'Do not confuse a forecast with a commitment.'
		],
		starterPrompts: [
			'Forecast whether this project is on track and show the assumptions behind the answer.',
			'Build three trajectory scenarios and recommend the next strategic moves.'
		],
		lastUpdated: '2026-07-10'
	},
	plan_management: {
		displayTitle: 'Plan Management',
		description:
			'Create and maintain execution plans that expose sequence, dependencies, and update rules.',
		domainId: 'planning-and-ops',
		family: 'Project Operations',
		outputShapes: ['execution plan', 'dependency map', 'update rules'],
		workflow: [
			'Confirm the outcome, planning horizon, and constraints.',
			'Decompose the work into coherent phases and dependencies.',
			'Define how progress, decisions, and changes should update the plan.',
			'Review the proposed plan before writing changes.'
		],
		useCases: [
			'Create a plan from an approved project brief.',
			'Resequence work after a constraint or decision changes.',
			'Make a vague roadmap executable.'
		],
		guardrails: [
			'Do not imply dates or capacity that have not been confirmed.',
			'Do not create duplicate plans when an existing plan should be updated.',
			'Do not mutate project structure without showing the proposed changes.'
		],
		starterPrompts: [
			'Turn this approved outcome into an execution plan with explicit dependencies.',
			'Audit and resequence this plan after the latest constraint changed.'
		],
		lastUpdated: '2026-07-10'
	},
	task_management: {
		displayTitle: 'Task Management',
		description:
			'Shape project work into clear tasks with ownership, timing, and relationships that remain maintainable.',
		domainId: 'planning-and-ops',
		family: 'Project Operations',
		outputShapes: ['task map', 'ownership and schedule plan', 'relationship map'],
		workflow: [
			'Inspect the project outcome, plan, and existing tasks before adding work.',
			'Define task boundaries, completion evidence, ownership, and timing.',
			'Map dependencies and parent-child relationships.',
			'Present the exact proposed task changes before applying them.'
		],
		useCases: [
			'Break an approved plan into executable tasks.',
			'Repair duplicate, vague, or disconnected task lists.',
			'Clarify task ownership and dependency order.'
		],
		guardrails: [
			'Do not create tasks before checking what already exists.',
			'Do not infer assignees or deadlines without evidence.',
			'Do not turn every idea into a task when a note or decision is more appropriate.'
		],
		starterPrompts: [
			'Turn this approved plan into a task map with owners, timing, and dependencies.',
			'Audit these tasks for duplication, vague completion criteria, and broken relationships.'
		],
		lastUpdated: '2026-07-10'
	},
	task_state_updates: {
		displayTitle: 'Task State Updates',
		description:
			'Apply accurate task-state changes while keeping status, evidence, and related fields aligned.',
		domainId: 'planning-and-ops',
		family: 'Project Operations',
		outputShapes: ['state-change plan', 'exact task update set', 'update summary'],
		workflow: [
			'Identify the exact task and the evidence that its state changed.',
			'Choose the valid next state and any related field updates.',
			'Preview the complete mutation set and check for conflicts.',
			'Apply only approved changes and summarize the result.'
		],
		useCases: [
			'Mark work started, blocked, completed, or reopened.',
			'Keep state changes aligned with task descriptions and evidence.',
			'Correct an inconsistent task state.'
		],
		guardrails: [
			'Do not change state based on a guess or ambiguous progress language.',
			'Do not update the wrong task when names are similar.',
			'Do not report a mutation as complete until the result is confirmed.'
		],
		starterPrompts: [
			'Prepare the exact state update for this task based on the work just completed.',
			'Check this task state for consistency and propose the smallest correction.'
		],
		lastUpdated: '2026-07-10'
	},
	document_workspace: {
		displayTitle: 'Document Workspace',
		description:
			'Create and reorganize project documents with deliberate hierarchy, linkage, and safe write behavior.',
		domainId: 'planning-and-ops',
		family: 'Project Operations',
		outputShapes: ['document hierarchy plan', 'linkage map', 'safe action checklist'],
		workflow: [
			'Inspect the project and existing documents before creating or moving anything.',
			'Choose the right document purpose, parent, position, and project links.',
			'Preview the hierarchy or content mutation and check for duplication.',
			'Apply approved writes and verify the resulting structure.'
		],
		useCases: [
			'Create a project document in the correct location.',
			'Reorganize an unclear document hierarchy.',
			'Connect plans, decisions, tasks, and source documents.'
		],
		guardrails: [
			'Do not create a duplicate document when an existing one should be updated.',
			'Do not move or overwrite documents without explicit scope.',
			'Do not treat links or hierarchy as decoration; preserve their operational meaning.'
		],
		starterPrompts: [
			'Plan the right document hierarchy and links for this project before writing anything.',
			'Audit this project workspace and propose a safe document reorganization.'
		],
		lastUpdated: '2026-07-10'
	}
};

export const skillMetadataBySlug: Record<string, SkillGalleryMetadata> = {
	'cold-email-icp-signal-design': {
		family: 'Cold Outreach',
		outputs: ['segment map', 'signal thesis', 'disqualifiers'],
		workflow: [
			'Define the segment and disqualifiers.',
			'Name the buying signal and timing thesis.',
			'Map the committee and right-person path.',
			'Approve or reject the segment before outreach.'
		],
		useCases: [
			'Turn a broad target list into a usable ICP segment.',
			'Find buying signals before drafting outreach.',
			'Reject weak or mixed segments before a campaign ships.'
		],
		guardrails: [
			'Do not send outreach automatically.',
			'Do not mix personas or segments in one campaign.',
			'Do not use this for opted-in newsletter or lifecycle email.'
		],
		tryPrompts: [
			'Help me define the ICP, buying signal, and disqualifiers for this outbound campaign.',
			'Audit this target segment before I write cold outreach.'
		]
	},
	'cold-email-engagement-first-outreach': {
		family: 'Cold Outreach',
		outputs: ['campaign plan', 'email draft', 'reply routes'],
		workflow: [
			'Choose the outreach mode.',
			'Validate deliverability and segmentation.',
			'Draft the offer and researched bridge.',
			'Audit the ask, cadence, and reply routes.'
		],
		useCases: [
			'Plan a cold outbound campaign.',
			'Draft a strategic one-to-one cold email.',
			'Audit an outreach sequence before sending.'
		],
		guardrails: [
			'Do not send outreach automatically.',
			'Do not mix personas or segments in one campaign.',
			'Do not use this for opted-in newsletter or lifecycle email.'
		],
		tryPrompts: [
			'Help me design an engagement-first cold outreach campaign for this ICP.',
			'Audit this cold email and tell me what must change before sending.'
		]
	},
	'landing-page-scorecard-funnel': {
		family: 'Conversion Paths',
		outputs: ['funnel map', 'questionnaire', 'routing plan'],
		workflow: [
			'Define the scorecard promise.',
			'Map the landing page and questionnaire.',
			'Design the result and routing logic.',
			'Audit whether every step qualifies the lead.'
		],
		useCases: [
			'Design a scorecard funnel.',
			'Audit a landing page for qualification strength.',
			'Route leads by answers and fit.'
		],
		guardrails: [
			'Do not turn a scorecard into a generic lead form.',
			'Do not collect answers you will not use for routing.',
			'Keep result logic explainable before automating follow-up.'
		],
		tryPrompts: [
			'Design a scorecard funnel for this offer and ICP.',
			'Audit this landing page and tell me where the qualification path breaks.'
		]
	},
	'hook-craft-short-form': {
		family: 'Content Craft',
		outputs: ['hook options', 'rewrite pass', 'diagnostic'],
		workflow: [
			'Name the audience and viewing context.',
			'Select the hook archetype.',
			'Draft multiple opener options.',
			'Audit clarity, curiosity, and payoff alignment.'
		],
		useCases: [
			'Draft stronger short-form openers.',
			'Audit a blog, video, or social lead.',
			'Generate hook variations for one idea.'
		],
		guardrails: [
			'Do not bait-and-switch the payoff.',
			'Do not chase curiosity at the expense of clarity.',
			'Keep each opener tied to a specific audience moment.'
		],
		tryPrompts: [
			'Generate 12 hook options for this idea and audience.',
			'Audit this opener for clarity, curiosity, and payoff.'
		]
	},
	'story-driven-content-craft': {
		family: 'Content Craft',
		outputs: ['beat map', 'rewrite plan', 'retention audit'],
		workflow: [
			'Identify the audience belief or attention gap.',
			'Choose the structure and opening beat.',
			'Draft or audit the content path.',
			'Rewrite the weakest retention break.'
		],
		useCases: [
			'Make founder content hold attention.',
			'Diagnose why a brand post feels flat.',
			'Rewrite content around a clearer retention path.'
		],
		guardrails: [
			'Do not add story beats that do not change the reader view.',
			'Do not bury the tension after the opener.',
			'Preserve the useful point while tightening the path.'
		],
		tryPrompts: [
			'Audit this draft for the first attention break and rewrite that section.',
			'Help me turn this product update into a founder story with a clear payoff.'
		]
	},
	'viral-content-for-boring-brands': {
		family: 'Content Craft',
		outputs: ['content audit', 'format choice', 'six-filter pass'],
		workflow: [
			'Identify the audience belief or attention gap.',
			'Choose the structure and opening beat.',
			'Draft or audit the content path.',
			'Rewrite the weakest retention break.'
		],
		useCases: [
			'Make founder content hold attention.',
			'Diagnose why a brand post feels flat.',
			'Rewrite content around a clearer retention path.'
		],
		guardrails: [
			'Do not fake drama around a low-stakes claim.',
			'Do not force a trend format when the proof is stronger.',
			'Make the brand constraint part of the creative filter.'
		],
		tryPrompts: [
			'Audit this draft for the first attention break and rewrite that section.',
			'Help me turn this product update into a brand-account post people would actually watch.'
		]
	},
	'ui-ux-quality-review': {
		family: 'Interface Quality',
		outputs: ['interface audit', 'fix list', 'agent checks'],
		workflow: [
			'Map the surface region by region.',
			'Check alignment, hierarchy, overflow, and interaction.',
			'Name the highest-leverage fixes.',
			'Turn findings into agent-runnable checks.'
		],
		useCases: [
			'Audit a product screen or dashboard.',
			'Turn visual feedback into concrete fixes.',
			'Give an agent checkable UI quality rules.'
		],
		guardrails: [
			'Do not treat subjective taste as enough.',
			'Do not skip mobile or overflow checks.',
			'Do not add decoration before fixing hierarchy.'
		],
		tryPrompts: [
			'Audit this screen region by region and return the highest-leverage fixes.',
			'Turn this UI critique into agent-checkable rules.'
		]
	},
	'google-calendar-for-ai-agents-search-before-you-create': {
		family: 'Connected Tools',
		outputs: ['safe action plan', 'event mutation checklist'],
		workflow: [
			'Choose the calendar scope.',
			'Search before creating or changing events.',
			'Use exact event IDs for mutations.',
			'Treat recurrence and time zones as high-risk.'
		],
		useCases: [
			'Prevent duplicate calendar event creation.',
			'Update events with exact IDs and scope.',
			'Handle recurring events with appropriate caution.'
		],
		guardrails: [
			'Do not create events before searching.',
			'Do not mutate recurring events casually.',
			'Do not guess event IDs.'
		],
		tryPrompts: [
			'Help me safely create a calendar event without duplicating anything.',
			'Audit this calendar update plan for recurrence, time zone, and exact-ID risk.'
		]
	}
};
