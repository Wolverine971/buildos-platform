// apps/web/src/lib/services/agentic-chat/tools/buildos/references.ts
import type { BuildosDocReference } from './types';

export const AGENTIC_WORKFLOW_REFERENCE: BuildosDocReference = {
	title: 'Agentic Workflow Design Context',
	summary:
		'Defines BuildOS mission, ADHD-focused positioning, and how the SvelteKit web app and Railway worker coordinate through Supabase queues.'
};

export const WEB_DOCS_OVERVIEW_REFERENCE: BuildosDocReference = {
	title: 'Web App Documentation Overview',
	summary: 'Lists the responsibilities of the web surface, deployment notes, and documentation navigation patterns.'
};

export const FEATURES_INDEX_REFERENCE: BuildosDocReference = {
	title: 'Features Documentation Index',
	summary: 'Maps flagship features such as Brain Dump, Calendar, Notifications, Admin Dashboard, and Onboarding.'
};

export const ONTOLOGY_REFERENCE: BuildosDocReference = {
	title: 'Ontology System Documentation',
	summary: 'Explains the template-driven ontology, the context/scale/stage facets, and canonical context documents.'
};

export const TEMPLATE_INHERITANCE_REFERENCE: BuildosDocReference = {
	title: 'Project Template Inheritance Notes',
	summary: 'Details template resolution, default prop merging, and the instantiation flow for `create_onto_project`.'
};

export const CHAT_ARCHITECTURE_REFERENCE: BuildosDocReference = {
	title: 'Chat System Architecture',
	summary: 'Covers the progressive disclosure engine, SSE streaming, and tool executor routing.'
};

export const CALENDAR_FEATURE_REFERENCE: BuildosDocReference = {
	title: 'Calendar Integration Feature',
	summary: 'Details OAuth, bidirectional sync, per-project calendars, conflict detection, and webhook-driven updates.'
};

export const ONBOARDING_REFERENCE: BuildosDocReference = {
	title: 'Onboarding Feature Overview',
	summary: 'Guided flow that educates new users, prompts a first brain dump, and connects priority integrations.'
};

export const STYLE_GUIDE_REFERENCE: BuildosDocReference = {
	title: 'BuildOS Style Guide',
	summary:
		'Apple-inspired visual language that emphasizes clarity, gradients, motion standards, and accessibility across components.'
};
