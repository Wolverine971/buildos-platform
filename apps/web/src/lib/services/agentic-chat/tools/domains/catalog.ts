// apps/web/src/lib/services/agentic-chat/tools/domains/catalog.ts
import type { DomainDefinition } from './types';

const DOMAIN_CATALOG: DomainDefinition[] = [
	{
		id: 'marketing',
		name: 'Marketing',
		parentIds: [],
		aliases: ['marketing', 'growth', 'go to market', 'audience growth', 'distribution'],
		summary:
			'Finding, reaching, educating, and converting an audience through positioning, content, distribution, campaigns, and proof.',
		boundaries: [
			'Use more specific child domains when the user names a channel, audience, or growth motion.',
			'Do not assume paid acquisition unless the user mentions ads or budget.'
		],
		coverageStatus: 'partial',
		capabilityIds: ['planning', 'documents', 'web_research'],
		skills: [
			{
				id: 'content_strategy_beyond_blogging',
				useWhen:
					'the user asks for a broad content strategy, channel strategy, distribution plan, or format decision'
			},
			{
				id: 'content_creation_pipeline',
				useWhen:
					'the user has one idea or half-formed thought and wants a step-by-step path from idea to a drafted post, video, essay, or newsletter'
			},
			{
				id: 'linkedin_company_page_growth',
				useWhen: 'the user asks about growing a LinkedIn Company Page or company account'
			},
			{
				id: 'ai_era_craft_and_quality_moat',
				useWhen:
					'the user is deciding whether or where to fund craft and quality as a differentiation strategy — roadmap arbitration, craft hiring, quality north star, or AI-slop diagnosis — rather than performing a tactical design review'
			}
		],
		relatedDomainIds: [
			'marketing.content_strategy',
			'marketing.short_form_video',
			'marketing.youtube_growth',
			'marketing.linkedin_company_page_growth',
			'creator_growth',
			'sales_and_growth'
		],
		gaps: [
			{
				missingSkillId: 'marketing_strategy_router',
				userNeed:
					'route broad marketing requests to the right channel or campaign playbook',
				summary: 'No general marketing strategy root skill exists yet.'
			}
		]
	},
	{
		id: 'marketing.content_strategy',
		name: 'Content Strategy',
		parentIds: ['marketing'],
		aliases: [
			'content strategy',
			'content plan',
			'content system',
			'distribution plan',
			'content marketing',
			'publishing strategy',
			'founder content',
			'brand content'
		],
		summary:
			'Choosing what to publish, where to publish it, how each format serves user intent, and how content becomes a repeatable distribution system.',
		boundaries: [
			'Use short-form or YouTube child domains when the platform and format are already central.',
			'Do not default to blog volume when the user needs positioning, social distribution, video, or conversion assets.'
		],
		coverageStatus: 'strong',
		capabilityIds: ['planning', 'documents', 'web_research'],
		skills: [
			{
				id: 'content_strategy_beyond_blogging',
				useWhen:
					'the user needs a content system, format decision, publishing strategy, repurposing plan, or durable point of view'
			},
			{
				id: 'algorithm_aware_publishing',
				useWhen:
					'the user needs platform choice, topic discipline, algorithm fit, rented-to-owned distribution, or brand-safe publishing decisions'
			},
			{
				id: 'going_viral',
				useWhen:
					'the user is planning or post-morteming a specific piece of social content and platform-specific 2025/2026 algorithm behavior on TikTok, Instagram, X, or LinkedIn matters'
			},
			{
				id: 'viral_content_for_boring_brands',
				useWhen:
					'a brand or founder account needs content for a boring product (B2B SaaS, dev tools, commodity goods) to earn attention and spread, or needs to diagnose why a brand post died'
			}
		],
		recommendedSkillStacks: [
			{
				id: 'marketing_content_strategy_plan',
				name: 'Content Strategy Plan',
				useWhen:
					'the user needs a channel or content system plan rather than one asset rewrite',
				skillIds: ['content_strategy_beyond_blogging', 'algorithm_aware_publishing']
			},
			{
				id: 'idea_to_draft_pipeline',
				name: 'Idea-to-Draft Pipeline',
				useWhen:
					'the user has one idea and wants it walked from raw thought to a ship-ready draft, not a channel strategy',
				skillIds: [
					'content_creation_pipeline',
					'idea_expansion_lens',
					'storyboard_journey_lens',
					'lived_conviction_lens',
					'framework_extraction_lens',
					'sensory_double_tap',
					'medium_tailoring'
				]
			}
		],
		resources: [
			{
				id: 'youtube_library.marketing_and_content_combo_index',
				title: 'Marketing and Content Skill Combo Index',
				summary:
					'Internal source map for marketing/content skill coverage, drafted playbooks, and remaining gaps.',
				whenToLoad: [
					'Load when expanding the marketing/content skill family or checking which content skills are source-backed.'
				]
			}
		],
		relatedDomainIds: [
			'marketing',
			'marketing.short_form_video',
			'marketing.youtube_growth',
			'creator_growth'
		]
	},
	{
		id: 'marketing.short_form_video',
		name: 'Short-Form Video',
		parentIds: ['marketing', 'creator_growth', 'marketing.content_strategy'],
		aliases: [
			'short form video',
			'short-form video',
			'tiktok',
			'reels',
			'youtube shorts',
			'shorts',
			'vertical video',
			'viral video',
			'hooks',
			'video scripts',
			// Story/retention craft recall (2026-07-02): "fix the narrative arc" of a
			// video draft sensed zero content-family domains and misrouted to
			// product/design. story_driven_content_craft lives in this domain's
			// skill list, so these terms must land here.
			'video draft',
			'narrative arc',
			'story arc',
			'story structure',
			'storytelling',
			'story'
		],
		summary:
			'Planning, drafting, auditing, and improving short-form video ideas, hooks, scripts, retention paths, and publishing fit.',
		boundaries: [
			'Use marketing.youtube_growth when the unit of work is the whole YouTube channel, long-form packaging, or channel diagnostics.',
			'Do not chase generic virality when the user is trying to build qualified demand or trust.'
		],
		coverageStatus: 'strong',
		capabilityIds: ['planning', 'documents', 'web_research'],
		skills: [
			{
				id: 'content_strategy_beyond_blogging',
				useWhen:
					'the user needs the upstream content game, audience, format, or distribution decision'
			},
			{
				id: 'hook_craft_short_form',
				useWhen:
					'the first 1-5 seconds, lede, first line, or opt-in moment is the bottleneck'
			},
			{
				id: 'viral_video_script_structure',
				useWhen:
					'the body, retention sequence, value loop, or full video script needs structure'
			},
			{
				id: 'story_driven_content_craft',
				useWhen:
					'the piece has a thesis but feels structurally flat, slow, or low-retention'
			},
			{
				id: 'algorithm_aware_publishing',
				useWhen:
					'the user needs platform fit, topic discipline, algorithm-coherent publishing, or brand-safe distribution'
			}
		],
		recommendedSkillStacks: [
			{
				id: 'short_form_video_asset_improvement',
				name: 'Short-Form Asset Improvement',
				useWhen: 'the user has one video idea, hook, draft, or script to improve',
				skillIds: [
					'hook_craft_short_form',
					'viral_video_script_structure',
					'story_driven_content_craft'
				]
			},
			{
				id: 'short_form_video_publishing_system',
				name: 'Short-Form Publishing System',
				useWhen: 'the user needs repeatable topics, platform fit, and publishing cadence',
				skillIds: [
					'content_strategy_beyond_blogging',
					'algorithm_aware_publishing',
					'hook_craft_short_form'
				]
			}
		],
		relatedDomainIds: [
			'marketing.content_strategy',
			'marketing.youtube_growth',
			'creator_growth'
		]
	},
	{
		id: 'marketing.youtube_growth',
		name: 'YouTube Growth',
		parentIds: ['marketing', 'creator_growth', 'marketing.content_strategy'],
		aliases: [
			'youtube growth',
			'youtube audience',
			'grow my youtube audience',
			'grow my youtube channel',
			'youtube subscribers',
			'youtube strategy',
			'youtube channel',
			'long-form youtube',
			'youtube packaging',
			'creator channel'
		],
		summary:
			'Growing a YouTube channel through positioning, content game selection, hooks, scripts, packaging, publishing rhythm, audience understanding, and retention-aware content.',
		boundaries: [
			'Use short-form video when the user is focused on Shorts, TikTok, Reels, or a single vertical video.',
			'Coverage is strongest for content strategy, hooks, scripts, and publishing fit; channel analytics and long-form packaging are still gaps.'
		],
		coverageStatus: 'partial',
		capabilityIds: ['planning', 'documents', 'web_research'],
		skills: [
			{
				id: 'content_strategy_beyond_blogging',
				useWhen:
					'the user needs channel positioning, content game selection, or format strategy'
			},
			{
				id: 'hook_craft_short_form',
				useWhen: 'the user needs stronger openings, titles, leads, or first seconds'
			},
			{
				id: 'viral_video_script_structure',
				useWhen: 'the user needs a short-form or long-form video script structure'
			},
			{
				id: 'story_driven_content_craft',
				useWhen: 'the user needs narrative structure, retention loops, or story craft'
			},
			{
				id: 'algorithm_aware_publishing',
				useWhen: 'the user needs platform strategy, topic discipline, or publishing cadence'
			},
			{
				id: 'youtube_channel_craft_for_founders',
				useWhen:
					'the user wants channel-level diagnosis, title+thumbnail packaging, format/series design, upload cadence, or a next-videos plan for a founder-led YouTube channel'
			}
		],
		recommendedSkillStacks: [
			{
				id: 'youtube_growth_strategy_plan',
				name: 'YouTube Growth Strategy Plan',
				useWhen:
					'the user wants a channel growth plan, positioning, publishing rhythm, or first-video roadmap',
				skillIds: [
					'youtube_channel_craft_for_founders',
					'content_strategy_beyond_blogging',
					'algorithm_aware_publishing',
					'viral_video_script_structure'
				]
			},
			{
				id: 'youtube_video_improvement',
				name: 'YouTube Video Improvement',
				useWhen: 'the user has one YouTube video idea, title, hook, or script to improve',
				skillIds: [
					'hook_craft_short_form',
					'viral_video_script_structure',
					'story_driven_content_craft'
				]
			}
		],
		relatedDomainIds: [
			'creator_growth',
			'marketing.short_form_video',
			'marketing.content_strategy'
		],
		gaps: [
			{
				missingSkillId: 'youtube_channel_diagnostics',
				userNeed:
					'diagnose channel growth blockers from analytics, packaging, and content history',
				summary:
					'No dedicated YouTube analytics or channel-diagnostics skill exists yet; youtube_channel_craft_for_founders names this gap rather than faking benchmarks.'
			}
		]
	},
	{
		id: 'marketing.linkedin_company_page_growth',
		name: 'LinkedIn Company Page Growth',
		parentIds: ['marketing'],
		aliases: [
			'linkedin company page',
			'company linkedin',
			'linkedin page growth',
			'grow our linkedin page',
			'linkedin followers',
			'linkedin reach',
			'linkedin engagement'
		],
		summary:
			'Growing a LinkedIn Company Page through Page hygiene, useful native content, executive and employee distribution, active commenting, proof, and measurement.',
		boundaries: [
			'This is for Company Pages and company accounts, not primarily personal creator accounts.',
			'Do not treat the Page as the whole distribution engine; founder and employee advocacy usually matter.'
		],
		coverageStatus: 'strong',
		capabilityIds: ['planning', 'documents', 'web_research'],
		skills: [
			{
				id: 'linkedin_company_page_growth',
				useWhen:
					'the user wants a LinkedIn Company Page audit, growth plan, content calendar, SME map, or measurement system'
			}
		],
		resources: [
			{
				id: 'linkedin_company_page_growth.growth_playbook',
				title: 'LinkedIn Company Page Growth Playbook',
				summary:
					'Reference module with current LinkedIn Page growth strategy, content system, distribution, and measurement guidance.',
				whenToLoad: [
					'Load after linkedin_company_page_growth when the user needs detailed tactics, benchmarks, or source-backed recommendations.'
				]
			}
		],
		relatedDomainIds: ['marketing', 'sales_and_growth', 'creator_growth']
	},
	{
		id: 'sales_and_growth',
		name: 'Sales and Growth',
		parentIds: [],
		aliases: ['sales', 'growth', 'pipeline', 'outreach', 'leads', 'lead generation'],
		summary:
			'Finding and converting qualified demand through segmentation, offers, outreach, follow-up, learning loops, and trust-preserving sales motions.',
		boundaries: [
			'Use sales_and_growth.cold_email when the user specifically needs outbound email or sender-readiness guidance.',
			'Do not treat relationship-building or broad brand work as cold outreach unless the user asks for outreach.'
		],
		coverageStatus: 'partial',
		capabilityIds: ['planning', 'people_context', 'documents', 'web_research'],
		skills: [
			{
				id: 'cold_email_engagement_first_outreach',
				useWhen:
					'the user needs cold outreach planning, drafting, auditing, reply handling, or campaign learning'
			},
			{
				id: 'lead_list_research',
				useWhen:
					'the user needs to source, score, or clean a qualified account or lead list before any outreach is written'
			},
			{
				id: 'landing_page_scorecard_funnel',
				useWhen:
					'the user needs to design or audit a scorecard, quiz, or assessment-driven landing page that qualifies, segments, and routes leads instead of just collecting emails'
			},
			{
				id: 'growth_diagnostics_for_stalled_products',
				useWhen:
					'growth has stalled or plateaued and the user needs the highest-leverage constraint (churn, pricing, expansion, channels, or end-state) diagnosed before proposing tactics'
			}
		],
		relatedDomainIds: ['sales_and_growth.cold_email', 'marketing']
	},
	{
		id: 'sales_and_growth.cold_email',
		name: 'Cold Email Outreach',
		parentIds: ['sales_and_growth'],
		aliases: [
			'cold email',
			'cold outreach',
			'outbound email',
			'email prospects',
			'founder outreach',
			'investor outreach',
			'deliverability'
		],
		summary:
			'Trust-preserving cold outreach across B2B sales, founder-led outreach, investor fundraising, recruiting, PR, partnerships, podcasts, and customer research.',
		boundaries: [
			'Use child skills only for the weak or missing input: ICP, offer, research anchor, compiler, taste review, deliverability, reply handling, or learning review.',
			'Do not recommend scaled sending before sender trust and deliverability constraints are checked.'
		],
		coverageStatus: 'strong',
		capabilityIds: ['planning', 'people_context', 'documents', 'web_research'],
		skills: [
			{
				id: 'cold_email_engagement_first_outreach',
				useWhen: 'the user needs the root outreach workflow or campaign operating frame'
			},
			{
				id: 'cold_email_icp_signal_design',
				useWhen:
					'the target segment, buyer moment, signal, committee map, or disqualifier logic is weak'
			},
			{
				id: 'cold_email_offer_lab',
				useWhen:
					'the cold offer is missing, meeting-first, too large, or not artifact-shaped'
			},
			{
				id: 'cold_email_research_anchors',
				useWhen:
					'a strategic or single-target email needs a specific, real, recent reason for writing'
			},
			{
				id: 'cold_email_outreach_compiler',
				useWhen:
					'prepared outreach ingredients need to become a finished email or campaign bundle'
			},
			{
				id: 'cold_email_deliverability_readiness',
				useWhen: 'volume, cold domains, inbox health, warmup, or complaint risk matters'
			},
			{
				id: 'cold_email_reply_os',
				useWhen: 'a reply, objection, silence, or thread follow-up needs routing'
			},
			{
				id: 'lead_list_research',
				useWhen:
					'the campaign needs a sourced, scored, and cleaned lead list before ICP signals or outreach drafting'
			}
		],
		recommendedSkillStacks: [
			{
				id: 'cold_email_campaign_build',
				name: 'Cold Email Campaign Build',
				useWhen:
					'the user needs to go from target segment and offer to a finished outreach bundle',
				skillIds: [
					'cold_email_engagement_first_outreach',
					'cold_email_icp_signal_design',
					'cold_email_offer_lab',
					'cold_email_research_anchors',
					'cold_email_outreach_compiler'
				]
			},
			{
				id: 'cold_email_sender_readiness',
				name: 'Cold Email Sender Readiness',
				useWhen: 'deliverability, volume, warmup, domains, or complaint risk is central',
				skillIds: [
					'cold_email_engagement_first_outreach',
					'cold_email_deliverability_readiness'
				]
			}
		],
		relatedDomainIds: ['sales_and_growth', 'marketing'],
		notes: [
			'The root skill is intentionally the default. Load children only for narrow failure modes.'
		]
	},
	{
		id: 'product_and_design',
		name: 'Product and Design',
		parentIds: [],
		aliases: [
			'product design',
			'product quality',
			'ux',
			'ui',
			'design',
			'interface',
			'product experience'
		],
		summary:
			'Designing, reviewing, and improving product interfaces, information architecture, interaction quality, usability, accessibility, visual craft, and design systems.',
		boundaries: [
			'Use child domains to separate UI/UX review, visual craft, accessibility, IA, design systems, and research.',
			'Do not flatten every design problem into visual polish.'
		],
		coverageStatus: 'strong',
		capabilityIds: ['planning', 'documents', 'web_research'],
		skills: [
			{
				id: 'build_quality_ui_ux',
				useWhen:
					'the user needs a root router for product screen quality, design review, UI implementation, or design-system work'
			}
		],
		relatedDomainIds: [
			'product_and_design.ui_ux_quality',
			'product_and_design.design_systems',
			'product_and_design.usability_research'
		]
	},
	{
		id: 'product_and_design.ui_ux_quality',
		name: 'UI/UX Quality',
		parentIds: ['product_and_design'],
		aliases: [
			'ui review',
			'ux review',
			'product review',
			'visual polish',
			'accessibility review',
			'information architecture',
			'usability',
			'interface quality'
		],
		summary:
			'Reviewing product screens and flows for hierarchy, clarity, spacing, type, color, consistency, interaction behavior, accessibility, usability, and craft.',
		boundaries: [
			'Use the root build_quality_ui_ux skill to route broad reviews before loading narrower child skills.',
			'Use accessibility, IA, visual craft, or usability child skills only when that lens is clearly central.'
		],
		coverageStatus: 'strong',
		capabilityIds: ['planning', 'documents', 'web_research'],
		skills: [
			{
				id: 'build_quality_ui_ux',
				useWhen: 'the request needs routing across multiple UI/UX quality lenses'
			},
			{
				id: 'ui_ux_quality_review',
				useWhen: 'the user wants a general screen or flow quality review'
			},
			{
				id: 'visual_craft_fundamentals',
				useWhen:
					'visual polish, spacing, type, color, shadows, or layout craft is the main issue'
			},
			{
				id: 'accessibility_inclusive_ui_review',
				useWhen:
					'keyboard, semantics, ARIA, focus, reduced motion, forms, or inclusive behavior matters'
			},
			{
				id: 'information_architecture_review',
				useWhen:
					'labels, conceptual model, wayfinding, affordances, or interaction structure is unclear'
			},
			{
				id: 'usability_quick_research',
				useWhen: 'the user needs lightweight user research or a 3-user usability test plan'
			}
		],
		recommendedSkillStacks: [
			{
				id: 'ui_ux_screen_review',
				name: 'UI/UX Screen Review',
				useWhen:
					'the user wants a product screen or flow reviewed across structure, visual craft, accessibility, and usability',
				skillIds: [
					'build_quality_ui_ux',
					'information_architecture_review',
					'ui_ux_quality_review',
					'visual_craft_fundamentals',
					'accessibility_inclusive_ui_review'
				]
			}
		],
		relatedDomainIds: ['product_and_design', 'product_and_design.design_systems']
	},
	{
		id: 'product_and_design.design_systems',
		name: 'Design Systems',
		parentIds: ['product_and_design'],
		aliases: [
			'design system',
			'component library',
			'tokens',
			'component architecture',
			'design system operations',
			'ui components'
		],
		summary:
			'Design-system architecture, component hierarchy, token taxonomy, adoption, governance, releases, intake, and product outcomes.',
		boundaries: [
			'Use when the system of components or governance is the subject, not just one screen polish pass.',
			'Pair with UI/UX quality only when concrete product screens need review.'
		],
		coverageStatus: 'strong',
		capabilityIds: ['planning', 'documents', 'web_research'],
		skills: [
			{
				id: 'build_quality_ui_ux',
				useWhen: 'the design-system request needs routing or source provenance'
			},
			{
				id: 'design_system_architecture_review',
				useWhen:
					'the user needs design-system architecture, token, component, governance, or adoption review'
			}
		],
		relatedDomainIds: ['product_and_design', 'product_and_design.ui_ux_quality']
	},
	{
		id: 'product_and_design.usability_research',
		name: 'Usability Research',
		parentIds: ['product_and_design', 'product_and_design.ui_ux_quality'],
		aliases: [
			'usability research',
			'usability testing',
			'user research',
			'user interviews',
			'quick research',
			'3-user test',
			'research plan'
		],
		summary:
			'Lightweight research planning, assumption checks, short interviews, usability tests, synthesis, and practical validation for product decisions.',
		boundaries: [
			'Use when user evidence or validation risk is central, not when the user only needs visual polish.',
			'Keep the method proportional to the decision risk and stage.'
		],
		coverageStatus: 'strong',
		capabilityIds: ['planning', 'documents', 'web_research'],
		skills: [
			{
				id: 'build_quality_ui_ux',
				useWhen:
					'the research request needs routing across UI/UX quality or product-design lenses'
			},
			{
				id: 'usability_quick_research',
				useWhen:
					'the user needs research questions, an assumption check, lightweight interviews, a 3-user test plan, or synthesis'
			}
		],
		relatedDomainIds: ['product_and_design', 'product_and_design.ui_ux_quality']
	},
	{
		id: 'creator_growth',
		name: 'Creator Growth',
		parentIds: ['marketing'],
		aliases: [
			'creator growth',
			'grow my audience',
			'youtube growth',
			'youtube channel',
			'short form video',
			'content creator',
			'personal brand'
		],
		summary:
			'Growing a creator audience through positioning, content strategy, hooks, formats, publishing rhythm, distribution, and feedback loops.',
		boundaries: [
			'Use marketing.linkedin_company_page_growth for company LinkedIn Pages.',
			'Do not assume the platform is YouTube or short-form unless the user says so.'
		],
		coverageStatus: 'partial',
		capabilityIds: ['planning', 'documents', 'web_research'],
		skills: [
			{
				id: 'content_strategy_beyond_blogging',
				useWhen:
					'the user needs creator positioning, content game selection, or publishing strategy'
			},
			{
				id: 'algorithm_aware_publishing',
				useWhen: 'the user needs platform-fit or algorithm-aware publishing decisions'
			},
			{
				id: 'youtube_channel_craft_for_founders',
				useWhen:
					'the creator platform is YouTube and the unit of work is the whole channel — positioning, packaging discipline, cadence, or what to make next'
			}
		],
		relatedDomainIds: [
			'marketing',
			'marketing.content_strategy',
			'marketing.short_form_video',
			'marketing.youtube_growth',
			'marketing.linkedin_company_page_growth'
		],
		gaps: [
			{
				missingSkillId: 'creator_growth_strategy',
				userNeed: 'build a platform-specific creator growth strategy',
				summary: 'No runtime creator-growth root skill is registered yet.'
			},
			{
				missingSkillId: 'youtube_channel_diagnostics',
				userNeed: 'diagnose YouTube channel blockers from analytics and content history',
				summary: 'No dedicated YouTube analytics or channel-diagnostics skill exists yet.'
			}
		]
	},
	{
		id: 'writing',
		name: 'Writing',
		parentIds: [],
		aliases: ['writing', 'drafting', 'editing', 'book', 'essay', 'article', 'fiction'],
		summary:
			'Planning, drafting, editing, and organizing written work, from project notes to essays, articles, books, and fiction.',
		boundaries: [
			'Use BuildOS document tools for capture and organization.',
			'Use story-driven content craft only for nonfiction content structure, not all writing craft.'
		],
		coverageStatus: 'partial',
		capabilityIds: ['planning', 'documents'],
		skills: [
			{
				id: 'story_driven_content_craft',
				useWhen:
					'a nonfiction essay, blog post, script, or founder narrative has a thesis but needs stronger structure'
			},
			{
				id: 'nonfiction_writing_from_lived_conviction',
				useWhen:
					'the user wants an essay or blog post written from their own experience and voice, or wants a generic or AI-flavored draft rebuilt around a real speaker'
			}
		],
		relatedDomainIds: ['marketing.content_strategy', 'marketing.short_form_video'],
		gaps: [
			{
				missingSkillId: 'writing_craft',
				userNeed: 'guide writing strategy, structure, revision, or craft decisions',
				summary: 'No dedicated writing craft skill exists yet.'
			}
		]
	},
	{
		id: 'agent_engineering',
		name: 'Agent and Context Engineering',
		parentIds: [],
		aliases: [
			'context engineering',
			'agent engineering',
			'agent harness',
			'context for an agent',
			'agent context',
			'prompt bloat',
			'system prompt design',
			'ai-readable context',
			'structure context for ai',
			'agent reliability'
		],
		summary:
			'Designing the context an AI agent works with — selecting and structuring files, docs, memories, and tool outputs; building or debugging agent harnesses; reducing prompt bloat; and right-sizing evals.',
		boundaries: [
			'Use when the work is about how an AI agent is fed context or how an agent workflow is structured, not about deterministic code behavior unrelated to LLMs.',
			'Do not treat a generic prompt-wording request as harness design unless the user is structuring context, workflow stages, or reliability.'
		],
		coverageStatus: 'partial',
		capabilityIds: ['planning', 'documents'],
		skills: [
			{
				id: 'context_engineering_for_agent_work',
				useWhen:
					'the user wants to set up or structure context for an agent, convert messy notes into an AI-readable data layer, reduce a bloated system prompt, build or debug an agent harness, or figure out why an agent seems confused or ignores rules'
			}
		],
		notes: [
			'Single-skill root domain; coverage is the context_engineering_for_agent_work playbook. This is BuildOS-adjacent (the product is itself an agent context layer), so route real agent-context questions here instead of answering from generic knowledge.'
		]
	}
];

export function listDomains(): DomainDefinition[] {
	return [...DOMAIN_CATALOG];
}

export function getDomainById(id: string): DomainDefinition | undefined {
	const normalized = id.trim().toLowerCase();
	return DOMAIN_CATALOG.find((domain) => domain.id === normalized);
}

export function listChildDomains(parentId: string): DomainDefinition[] {
	return DOMAIN_CATALOG.filter((domain) => domain.parentIds.includes(parentId)).sort((a, b) =>
		a.id.localeCompare(b.id)
	);
}
