// apps/web/src/lib/services/agentic-chat/tools/buildos/usage-guide.ts
import type { BuildosDocGenerator, BuildosDocSection } from './types';
import {
	AGENTIC_WORKFLOW_REFERENCE,
	CALENDAR_FEATURE_REFERENCE,
	CHAT_ARCHITECTURE_REFERENCE,
	CHAT_CONVERSATION_MODES_REFERENCE,
	FEATURES_INDEX_REFERENCE,
	ONBOARDING_REFERENCE,
	ONTOLOGY_REFERENCE
} from './references';

const USAGE_SECTIONS: BuildosDocSection[] = [
	{
		title: '1. Onboard & Prime the Workspace',
		summary:
			'Start with the guided onboarding flow to explain core concepts, run a sample brain dump, and connect integrations.',
		highlights: [
			'The onboarding feature walks users through BuildOS pillars, gives them a safe space to try the brain dump composer, and points them at priority integrations such as Google Calendar.',
			'Use onboarding prompts to gather intent (personal vs. client work, focus areas) so future ontology projects inherit the right facets.',
			'Remind users to follow `/apps/web/docs/README.md` navigation if they want deeper implementation context after onboarding.'
		],
		references: [ONBOARDING_REFERENCE, FEATURES_INDEX_REFERENCE]
	},
	{
		title: '2. Capture Thoughts via Brain Dumps',
		summary:
			'Encourage users to describe anything that is cluttering their mind—BuildOS is optimized for ADHD stream-of-consciousness capture.',
		highlights: [
			'Brain dumps fuel the system’s core innovation: unstructured text is parsed into candidate projects, tasks, and context.',
			'The platform can run dual processing modes (long-form plus quick capture) and phase-based task grouping, so nudge users to be verbose.',
			'If the user references braindump-derived context later, the agent should look for the auto-generated context document linked on the project.'
		],
		references: [AGENTIC_WORKFLOW_REFERENCE, FEATURES_INDEX_REFERENCE]
	},
	{
		title: '3. Choose the Right Conversation Mode',
		summary:
			'Help users select the appropriate chat mode based on what they want to accomplish—global brainstorming, project work, or task deep-dives.',
		highlights: [
			'For exploring ideas across multiple projects or planning the week ahead, suggest global mode. This gives access to all projects, calendar, and cross-project tools.',
			'When working within a single project—asking "what is next?", creating tasks, or updating plans—recommend project mode. The agent loads that project context document and can reason about its specific needs.',
			'Within project mode, users can narrow focus further: users can say "Let me talk about the deployment task" or "Show me the API documentation document." The ProjectFocusSelector lets them choose tasks, goals, plans, documents, or outputs.',
			'For turning a spark of an idea into a structured project, use project_create mode. This guides through type_key classification, prop inference, facet selection, and initial planning.',
			'Task-focused mode is perfect for detailed work on one task: breaking it down, clarifying requirements, checking dependencies, or updating status.',
			'Explain that each mode loads different context: project mode loads the project narrative story from context documents; task mode loads task details, blockers, and related work.',
			'Remind users they can change modes mid-conversation if the scope shifts: users can say "let me switch to project mode so I can see related tasks."'
		],
		references: [CHAT_CONVERSATION_MODES_REFERENCE, CHAT_ARCHITECTURE_REFERENCE]
	},
	{
		title: '4. Use Agentic Chat to Reason & Plan',
		summary:
			'Once the right mode is selected, guide productive conversations using progressive disclosure and tool-assisted reasoning.',
		highlights: [
			'The chat system loads abbreviated data first (~400 tokens) and only fetches detailed records when the user drills deeper, so mention this when promising responsiveness.',
			'Tool groups cover list/search/detail/action operations—pick the smallest tool that answers the question (e.g., `list_onto_projects` before `get_onto_project_details`).',
			'Streaming responses keep the user informed while long-running tools execute, so set expectations about partial updates.',
			'In project mode, reference the project context document narrative when planning—it captures why the project matters and what success looks like.',
			'When focused on a specific entity (task, goal, etc.), use that focus to provide targeted answers without loading unrelated data.'
		],
		references: [CHAT_ARCHITECTURE_REFERENCE, CHAT_CONVERSATION_MODES_REFERENCE]
	},
	{
		title: '5. Structure Work with the Ontology',
		summary:
			'Move accepted ideas into the ontology so plans, tasks, goals, and documents stay linked and queryable in the knowledge graph.',
		highlights: [
			'When creating a project, always set the type_key (e.g., project.creative.book or project.technical.app) and infer the three facets (context, scale, stage) to keep the graph queryable.',
			'Context documents capture the narrative story of a project—why it matters, what success looks like, and the history of decisions. These come from brain dumps and persist as the project evolves.',
			'The ontology creates relationships: tasks belong to plans, plans support goals, everything connects to project context. This web of connections helps agents understand dependencies and the bigger picture.',
			'Props live in JSONB—populate them with concrete facts from the conversation (tech_stack, audience, budget, timelines).',
			'When the agent references context documents during planning, it has access to the full narrative story, not just task lists. This produces better, more aligned suggestions.'
		],
		references: [ONTOLOGY_REFERENCE]
	},
	{
		title: '6. Automate Scheduling & Reviews',
		summary:
			'Keep calendars, daily briefs, and notifications in sync so BuildOS feels like an always-on chief of staff.',
		highlights: [
			'The calendar integration handles OAuth, per-project Google Calendars, conflict detection, and webhook-driven updates—remind users to reconnect if access expires.',
			'Calendar analysis plus ontology plans enable adaptive task generation (e.g., deduplicating projects, expanding schedules when event count is high).',
			'Daily briefs and notifications leverage the same infrastructure highlighted in the features index, so reassure users that progress tracking is multi-channel.'
		],
		references: [CALENDAR_FEATURE_REFERENCE, FEATURES_INDEX_REFERENCE]
	},
	{
		title: '7. Iterate with Prop Inference & AI Agents',
		summary:
			'Teach power users how to iterate on prop inference, clarify gaps, and escalate when the model needs more guidance.',
		highlights: [
			'Coach the agent to restate the chosen type_key and key props it inferred so users can spot gaps quickly.',
			'If critical details are missing (budget, deadline, audience), ask 2–3 targeted questions; otherwise infer from context.',
			'Remind users that props come directly from the conversation—provide concrete facts (tech_stack, audience, guest_count, deadlines) to improve accuracy.'
		],
		references: [AGENTIC_WORKFLOW_REFERENCE]
	}
];

export const getBuildosUsageGuide: BuildosDocGenerator = () => ({
	documentTitle: 'BuildOS Usage Guide',
	lastReviewed: '2025-11-14',
	summary:
		'Step-by-step playbook for helping users capture inputs, organize them via ontology projects, and keep execution in sync with calendars and chat.',
	sections: USAGE_SECTIONS,
	recommendedQuestions: [
		'Can you walk me through how to capture a chaotic week inside BuildOS?',
		'How do I go from a braindump to a structured project with linked tasks?',
		'What should I tell a user who needs to reconnect Google Calendar or supply missing project details?'
	],
	followUpActions: [
		'Use `get_buildos_overview` if the user needs context before diving into workflows.',
		'Call ontology CRUD tools (`create_onto_project`, `create_onto_task`, etc.) once the user approves a plan from this guide.',
		'Leverage calendar-related endpoints if the user asks for concrete sync status after reading the scheduling section.'
	],
	notes: [
		'Answer the implicit “How do I use BuildOS?” question with this document before issuing tool calls.',
		'Sections are ordered chronologically so the agent can reference the right stage of the workflow.'
	]
});
