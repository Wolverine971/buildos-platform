// apps/web/src/lib/services/agentic-chat/tools/buildos/overview.ts
import type { BuildosDocGenerator, BuildosDocSection } from './types';
import {
	AGENTIC_WORKFLOW_REFERENCE,
	CALENDAR_FEATURE_REFERENCE,
	CHAT_ARCHITECTURE_REFERENCE,
	CHAT_CONVERSATION_MODES_REFERENCE,
	FEATURES_INDEX_REFERENCE,
	ONBOARDING_REFERENCE,
	ONTOLOGY_REFERENCE,
	STYLE_GUIDE_REFERENCE,
	TEMPLATE_INHERITANCE_REFERENCE,
	WEB_DOCS_OVERVIEW_REFERENCE
} from './references';

const OVERVIEW_SECTIONS: BuildosDocSection[] = [
	{
		title: 'Mission & Core Promise',
		summary:
			'BuildOS is positioned as an AI-powered productivity platform for ADHD minds that turns unstructured thoughts into structured execution plans.',
		highlights: [
			'Core innovation is the Brain Dump System that lets users stream thoughts which the AI converts into projects, tasks, and narrative context.',
			'The ecosystem pillars include brain dump processing, daily briefs, phase generation, calendar sync, and multi-channel notifications.',
			'Product direction emphasizes LLM planners that stay grounded in ontology data via curated tool calls.'
		],
		references: [AGENTIC_WORKFLOW_REFERENCE]
	},
	{
		title: 'Platform & Architecture Overview',
		summary:
			'The platform runs as a Turborepo monorepo with a SvelteKit web app and a Supabase-backed worker. Communication flows through database queues, never direct HTTP.',
		highlights: [
			'Web (Vercel) and Worker (Railway) communicate via Supabase RPC/queues with `SELECT FOR UPDATE SKIP LOCKED` semantics for safe parallel job claiming.',
			'The web app owns user UI, SSE chat streaming, and API routes, while the worker performs background processing such as brief generation and notification fan-out.',
			'Shared packages (`@buildos/shared-types`, Supabase client, config) keep schema and service contracts synced across surfaces.'
		],
		references: [AGENTIC_WORKFLOW_REFERENCE, WEB_DOCS_OVERVIEW_REFERENCE]
	},
	{
		title: 'Feature Landscape',
		summary:
			'Documentation is organized by feature verticals so LLM agents can quickly discover domain-specific specs.',
		highlights: [
			'Brain Dump, Calendar, Notifications, Admin Dashboard, Onboarding (v1/v2), Project Export, Phase Generation, and Time Blocks all have dedicated folders with entry-point READMEs.',
			'Each feature doc links to implementation guides (services, components, routes) ensuring the chat agent knows where to pull deeper context.',
			'Calendar integration covers OAuth, bidirectional sync, project-level calendars, and conflict detection; onboarding guides highlight the intro flow and integrations handoff.'
		],
		references: [FEATURES_INDEX_REFERENCE, CALENDAR_FEATURE_REFERENCE, ONBOARDING_REFERENCE]
	},
	{
		title: 'Ontology & Template System',
		summary:
			'Work management is modeled as an ontology—a knowledge graph where projects, tasks, plans, goals, and documents form interconnected webs of meaning instead of flat lists.',
		highlights: [
			'Every project uses a template (type_key like "writer.book" or "dev.app") plus three facets (context, scale, stage) to classify work without rigid hierarchies.',
			'Context documents capture the narrative "why" of a project—the story from brain dumps that persists as work evolves, giving AI agents rich background when planning.',
			'The graph structure creates relationships: tasks belong to plans, plans support goals, everything ties to project context. This web lets agents understand dependencies, priorities, and the bigger picture.',
			'Templates define default properties and suggestions, but projects remain flexible. Users can add custom fields, change states, and adapt the structure to their workflow.',
			'Template inheritance merges defaults at creation time, but the schema stays loose—projects evolve beyond their templates as needs change.'
		],
		references: [ONTOLOGY_REFERENCE, TEMPLATE_INHERITANCE_REFERENCE]
	},
	{
		title: 'Agentic Chat & Tooling',
		summary:
			'Agent chat relies on progressive disclosure, curated tool categories, and SSE streaming to keep LLM calls efficient.',
		highlights: [
			'Abbreviated context loads first (≈400 tokens) with detailed entity loads happening only on demand.',
			'Tool execution is separated into list/search/detail/action categories, and tool calls route through `ChatToolExecutor` with validation and telemetry.',
			'SSE stream handlers process incremental model chunks, enabling quick UI feedback while tools execute.'
		],
		references: [CHAT_ARCHITECTURE_REFERENCE]
	},
	{
		title: 'Conversation Modes & Project Focus',
		summary:
			'BuildOS chat adapts to what users want to work on—from global brainstorming to deep dives on individual tasks.',
		highlights: [
			'Global mode lets users work across all projects and calendar, perfect for high-level planning and cross-project coordination.',
			'Project mode focuses conversation within one project. Users can ask questions, create tasks, update plans, or request summaries—all scoped to that project context.',
			'Within project mode, the ProjectFocusSelector lets users narrow to a specific task, goal, plan, document, or output for deep, focused conversations about that one thing.',
			'Specialized flows exist for structured workflows: project_create guides turning ideas into projects, project_audit stress-tests for gaps, project_forecast explores timelines.',
			'Task-focused mode provides a spotlight on individual tasks—perfect for breaking down work, clarifying requirements, or updating status.',
			'Each mode changes what tools are available and how context loads. Project mode loads project context documents and related entities; task mode loads task details and dependencies.',
			'The focus system prevents context overload: instead of loading an entire project graph, the agent loads only what is relevant to the current conversation scope.'
		],
		references: [CHAT_CONVERSATION_MODES_REFERENCE, CHAT_ARCHITECTURE_REFERENCE]
	},
	{
		title: 'Experience & Design System',
		summary:
			'The UI follows a premium Apple-inspired visual language optimized for clarity and ADHD-friendly focus.',
		highlights: [
			'Design principles emphasize clarity, subtle gradients, consistent motion, and progressive disclosure.',
			'Color, typography, and spacing guidelines enforce WCAG AA compliance with light/dark parity.',
			'Component README files plus the style guide call out reusable patterns for badges, alerts, and layout density.'
		],
		references: [STYLE_GUIDE_REFERENCE]
	}
];

export const getBuildosOverviewDocument: BuildosDocGenerator = () => ({
	documentTitle: 'BuildOS Platform Overview',
	lastReviewed: '2025-11-14',
	summary:
		'High-level reference that explains what BuildOS is, how the ecosystem is architected, and where the major documentation sets live.',
	sections: OVERVIEW_SECTIONS,
	recommendedQuestions: [
		'What differentiates BuildOS from traditional project tools?',
		'How do the web app, worker, and Supabase queue interact in production?',
		'What information does the ontology system capture automatically when creating a project?'
	],
	followUpActions: [
		'Call `get_buildos_usage_guide` for concrete day-to-day workflows once the overview is understood.',
		'Use ontology search tools (`list_onto_projects`, `get_onto_project_details`) if the user wants live data after reading the overview.',
		'Reference the style guide when building UI responses or when the user asks about visual constraints.'
	],
	notes: [
		'Ideal when the user asks “What can BuildOS do?” or “Explain BuildOS at a high level.”',
		'Includes curated references so the agent can cite canonical documentation.'
	]
});
