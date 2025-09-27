// src/lib/config/project.ts
import {
	Target,
	Eye,
	Clock4,
	Users,
	TrendingUp,
	Mic,
	Share2,
	Heart,
	Brain,
	Play,
	Star,
	Zap,
	AlertCircle,
	FileText,
	Code,
	Search,
	Wrench,
	Clock
} from 'lucide-svelte';

export const priorityColors = {
	high: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
	medium: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
	low: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
};

export const statusColors = {
	backlog:
		'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
	in_progress:
		'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
	done: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
	blocked:
		'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
};

export const contextFieldConfig = {
	goals: {
		icon: Target,
		label: 'Goals & Outcomes',
		description: 'Key short & long-term objectives'
	},
	vision: {
		icon: Eye,
		label: 'Vision',
		description: 'What the world looks like if this succeeds'
	},
	phases: {
		icon: Clock4,
		label: 'Project Phases',
		description: 'Roadmap and timeline in stages'
	},
	target_users: {
		icon: Users,
		label: 'Target Users',
		description: 'Who this is for (personas, archetypes)'
	},
	growth_strategy: {
		icon: TrendingUp,
		label: 'Growth Strategy',
		description: "How you'll get traction"
	},
	brand_voice: {
		icon: Mic,
		label: 'Brand Voice',
		description: 'Style, tone, and point of view'
	},
	social_media_accounts: {
		icon: Share2,
		label: 'Social Media',
		description: 'Linked accounts and channel strategy'
	},
	feelings_to_invoke: {
		icon: Heart,
		label: 'Feelings to Invoke',
		description: 'Emotional effect on audience'
	},
	thoughts_to_think: {
		icon: Brain,
		label: 'Thoughts to Plant',
		description: 'Beliefs and frames to establish'
	},
	actions_to_do: {
		icon: Play,
		label: 'Call to Actions',
		description: 'Behaviors you want to encourage'
	},
	inspiration: {
		icon: Star,
		label: 'Inspiration',
		description: 'Brands, creators, aesthetics you admire'
	},
	differentiators: {
		icon: Zap,
		label: 'Differentiators',
		description: 'What makes this uniquely valuable'
	},
	current_problems: {
		icon: AlertCircle,
		label: 'Current Problems',
		description: 'Bottlenecks and known issues'
	},
	assets: {
		icon: FileText,
		label: 'Assets',
		description: 'Important links, design systems, docs, repos'
	},
	tech_stack: {
		icon: Code,
		label: 'Tech Stack',
		description: 'Technical infrastructure and tools'
	},
	keywords: {
		icon: Search,
		label: 'Keywords',
		description: 'SEO terms, semantic goals, search hooks'
	},
	llm_prompt_examples: {
		icon: Wrench,
		label: 'LLM Prompts',
		description: 'Good prompts to run for this project'
	},
	recent_updates: {
		icon: Clock,
		label: 'Recent Updates',
		description: 'Last 3-5 meaningful changes'
	},
	team_notes: {
		icon: Users,
		label: 'Team Notes',
		description: 'Stakeholder preferences and team notes'
	}
};
