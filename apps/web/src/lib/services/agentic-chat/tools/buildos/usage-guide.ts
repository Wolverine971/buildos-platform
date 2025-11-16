// apps/web/src/lib/services/agentic-chat/tools/buildos/usage-guide.ts
import type { BuildosDocGenerator, BuildosDocSection } from './types';
import {
	AGENTIC_WORKFLOW_REFERENCE,
	CALENDAR_FEATURE_REFERENCE,
	CHAT_ARCHITECTURE_REFERENCE,
	FEATURES_INDEX_REFERENCE,
	ONBOARDING_REFERENCE,
	ONTOLOGY_REFERENCE,
	TEMPLATE_INHERITANCE_REFERENCE
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
		title: '3. Use Agentic Chat to Reason & Plan',
		summary:
			'Once information exists, guide the user back into the chat modal to plan with progressive disclosure and tool-assisted reasoning.',
		highlights: [
			'The chat system loads abbreviated data first (~400 tokens) and only fetches detailed records when the user drills deeper, so mention this when promising responsiveness.',
			'Tool groups cover list/search/detail/action operations—pick the smallest tool that answers the question (e.g., `list_onto_projects` before `get_onto_project_details`).',
			'Streaming responses keep the user informed while long-running tools execute, so set expectations about partial updates.'
		],
		references: [CHAT_ARCHITECTURE_REFERENCE]
	},
	{
		title: '4. Structure Work with the Ontology',
		summary:
			'Move accepted ideas into the ontology so plans, tasks, goals, and documents stay linked and queryable.',
		highlights: [
			'When creating a project, always set the `type_key` (e.g., `writer.book`) and infer the three facets (context, scale, stage) to keep the graph queryable.',
			'Context documents are generated if missing, but it is better to capture the user’s braindump narrative explicitly so downstream planners have richer text.',
			'Template defaults inject `default_props` and facet hints automatically; schema definitions describe what you _can_ store but only defaults get merged automatically.'
		],
		references: [ONTOLOGY_REFERENCE, TEMPLATE_INHERITANCE_REFERENCE]
	},
	{
		title: '5. Automate Scheduling & Reviews',
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
		title: '6. Iterate with Templates & AI Agents',
		summary:
			'Teach power users how to evolve templates and leverage agent escalations when existing blueprints fall short.',
		highlights: [
			'Encourage frequent use of `list_onto_templates` during project planning so the LLM can reference real schema hints rather than hallucinate fields.',
			'If no template fits, escalate via the template creation flow (documented in agentic chat specs) so new realms or deliverables can be reviewed before use.',
			'Remind users that templates carry default props but they must still supply project-specific metadata (e.g., `mvp_date`, `tech_stack`).'
		],
		references: [TEMPLATE_INHERITANCE_REFERENCE, AGENTIC_WORKFLOW_REFERENCE]
	}
];

export const getBuildosUsageGuide: BuildosDocGenerator = () => ({
	documentTitle: 'BuildOS Usage Guide',
	lastReviewed: '2025-11-14',
	summary:
		'Step-by-step playbook for helping users capture inputs, organize them via ontology templates, and keep execution in sync with calendars and chat.',
	sections: USAGE_SECTIONS,
	recommendedQuestions: [
		'Can you walk me through how to capture a chaotic week inside BuildOS?',
		'How do I go from a braindump to a templated project with linked tasks?',
		'What should I tell a user who needs to reconnect Google Calendar or request a new template?'
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
