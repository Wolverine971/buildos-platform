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
