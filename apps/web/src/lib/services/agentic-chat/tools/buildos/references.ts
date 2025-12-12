// apps/web/src/lib/services/agentic-chat/tools/buildos/references.ts
import type { BuildosDocReference } from './types';

export const AGENTIC_WORKFLOW_REFERENCE: BuildosDocReference = {
	title: 'Agentic Workflow Design Context',
	summary:
		'BuildOS is built for ADHD minds—turning chaotic thoughts into structured plans. The web app (Vercel/SvelteKit) handles UI and real-time chat streaming, while the worker (Railway/Node.js) processes background jobs like daily briefs and email notifications. They communicate exclusively through Supabase queues using SELECT FOR UPDATE SKIP LOCKED for safe parallel job claiming, never via direct HTTP calls.'
};

export const WEB_DOCS_OVERVIEW_REFERENCE: BuildosDocReference = {
	title: 'Web App Documentation Overview',
	summary:
		'The web app is a SvelteKit application deployed to Vercel that handles all user-facing features: brain dump input, project management UI, agentic chat with SSE streaming, calendar integration, and real-time updates. Documentation is organized by feature (brain-dump, ontology, calendar, notifications) with technical guides for architecture, API patterns, and deployment. The web app never talks directly to the worker—all communication flows through Supabase RPC and queue tables.'
};

export const FEATURES_INDEX_REFERENCE: BuildosDocReference = {
	title: 'Features Documentation Index',
	summary:
		'BuildOS features are documented by vertical: Brain Dump (the core innovation for capturing unstructured thoughts), Calendar Integration (Google Calendar OAuth and bidirectional sync), Notifications (multi-channel updates), Ontology System (the knowledge graph), Onboarding (guiding new users), Admin Dashboard, Project Export, Phase Generation, and Time Blocks. Each feature has a dedicated folder with implementation guides, component documentation, and API endpoint references.'
};

export const ONTOLOGY_REFERENCE: BuildosDocReference = {
	title: 'Ontology System Documentation',
	summary:
		'The ontology is BuildOS\'s knowledge graph that connects projects, tasks, plans, goals, and documents. Every project is classified with a type_key (like "project.creative.book" or "project.technical.app") and three facets (context, scale, stage). Context documents store the narrative "story" of a project—capturing why it matters, not just what needs doing. These narratives come from brain dumps and persist as the project evolves, giving AI agents the full picture when planning. The graph structure means tasks link to plans, plans link to goals, and everything ties back to project context—creating a web of meaning instead of isolated to-do lists.'
};

export const PROJECT_CLASSIFICATION_REFERENCE: BuildosDocReference = {
	title: 'Project Classification System',
	summary:
		'Projects are classified with a type_key following the pattern project.{realm}.{deliverable}[.{variant}] (e.g., project.creative.book, project.technical.app). Each project has flexible props stored in JSONB for domain-specific properties, and facets (context, scale, stage) for categorization. The schema is flexible—users can add custom fields and adapt as their needs evolve.'
};

export const CHAT_ARCHITECTURE_REFERENCE: BuildosDocReference = {
	title: 'Chat System Architecture',
	summary:
		'BuildOS chat uses progressive disclosure to keep context small: abbreviated data loads first (~400 tokens), then detailed data on demand. Conversations happen in different modes: global (cross-project), project-focused, task-focused, or specialized flows like project_create. Within project mode, users can narrow focus to specific tasks, goals, plans, or documents via the ProjectFocusSelector. SSE streaming delivers incremental responses so the UI stays responsive while tools execute. Tool calls go through ChatToolExecutor which handles validation, telemetry, and error recovery.'
};

export const CALENDAR_FEATURE_REFERENCE: BuildosDocReference = {
	title: 'Calendar Integration Feature',
	summary:
		'BuildOS integrates with Google Calendar through OAuth, allowing each project to have its own dedicated calendar. The integration is bidirectional: tasks scheduled in BuildOS appear in Google Calendar, and calendar events can inform task planning. Conflict detection prevents double-booking, and webhook-driven updates keep everything in sync. The calendar analysis helps agents understand user availability and make smart scheduling suggestions when generating phases and tasks.'
};

export const ONBOARDING_REFERENCE: BuildosDocReference = {
	title: 'Onboarding Feature Overview',
	summary:
		'The onboarding flow introduces new users to BuildOS core concepts: brain dumps, the ontology system, and AI-powered planning. It walks them through a sample brain dump in a safe environment, explains how unstructured thoughts become structured projects, and guides them to connect priority integrations like Google Calendar. The flow also gathers user intent (personal vs. client work, focus areas) so future projects can inherit appropriate facets and classifications.'
};

export const STYLE_GUIDE_REFERENCE: BuildosDocReference = {
	title: 'BuildOS Style Guide',
	summary:
		'Apple-inspired visual language that emphasizes clarity, gradients, motion standards, and accessibility across components.'
};

export const CHAT_CONVERSATION_MODES_REFERENCE: BuildosDocReference = {
	title: 'Chat Conversation Modes & Project Focus',
	summary:
		'BuildOS chat adapts to what the user wants to work on. In global mode, users can work across all projects and calendar. In project mode, they work within one project—asking questions, creating tasks, updating plans. Project mode also supports focus narrowing: users can spotlight a specific task, goal, plan, document, or output to have deep conversations about that one thing. The project_create mode guides users through turning ideas into structured projects. Task-focused mode lets users dive into task details, dependencies, and execution. Each mode changes what tools are available and how context loads, ensuring the AI has the right information without overwhelming token limits.'
};
