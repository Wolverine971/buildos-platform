// apps/web/src/lib/types/synthesis.ts

export interface SynthesisOption {
	id: string;
	name: string;
	description: string;
	detailedDescription?: string;
	enabled: boolean;
	available: boolean;
	config?: any;
	icon?: string;
}

export interface TaskSynthesisConfig {
	// Consolidation settings
	consolidation: {
		enabled: boolean;
		aggressiveness: 'conservative' | 'moderate' | 'aggressive';
		preserveDetails: boolean;
	};

	// Sequencing settings
	sequencing: {
		enabled: boolean;
		considerDependencies: boolean;
		optimizeForParallel: boolean;
	};

	// Grouping settings
	grouping: {
		enabled: boolean;
		strategy: 'theme' | 'resource' | 'timeline' | 'automatic';
		maxGroupSize: number;
	};

	// Time estimation
	timeEstimation: {
		enabled: boolean;
		includeBufferTime: boolean;
		confidenceLevel: 'optimistic' | 'realistic' | 'conservative';
	};

	// Gap analysis
	gapAnalysis: {
		enabled: boolean;
		includePrerequisites: boolean;
		includeFollowUps: boolean;
		suggestMilestones: boolean;
	};

	// Dependencies
	dependencies: {
		enabled: boolean;
		autoDetect: boolean;
		strictMode: boolean;
	};
}

export interface SynthesisOptions {
	selectedModules: string[];
	config: {
		task_synthesis?: TaskSynthesisConfig;
		// Future: other module configs
		project_analysis?: any;
		completion_score?: any;
		thought_partner?: any;
	};
}

export interface SynthesisRequest {
	projectId: string;
	options: SynthesisOptions;
	regenerate?: boolean;
	includeDeleted?: boolean;
}
