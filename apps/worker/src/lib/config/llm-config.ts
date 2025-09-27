// worker-queue/src/lib/config/llm-config.ts

import dotenv from "dotenv";
// import {
// 	PRIVATE_LINODE_PASS,
// 	PRIVATE_LINODE_URL,
// 	PRIVATE_OLLAMA_HOME_PASS,
// 	PRIVATE_OLLAMA_HOME_URL_PUBLIC,
// 	PRIVATE_OPENAI_API_KEY
// } from '$env/static/private';

import type { LLMProvider, LLMModel } from "../types/llm";

// Enhanced LLMModel interface with context limits
export interface LLMModelWithLimits extends LLMModel {
  id: string;
  name: string;
  supportsJsonMode: boolean;
  supportsSystemPrompt?: boolean;
  supportsTemperature?: boolean;
  defaultTemperature?: number;
  description?: string;
  smartness?: number;
  inputCost?: number;
  // New fields for context management
  maxContextTokens: number;
  recommendedMaxTokens: number; // Safe limit to avoid timeouts
  timeoutMs?: number;
}

export const defaultLLMConfig: LLMProvider[] = [
  {
    id: "home-mistral",
    name: "Home Mistral",
    url: `${process.env.PRIVATE_OLLAMA_HOME_URL_PUBLIC}/api/generate`,
    apiKey: process.env.PRIVATE_OLLAMA_HOME_PASS,
    priority: 1,
    healthCheckEndpoint: `${process.env.PRIVATE_OLLAMA_HOME_URL_PUBLIC}`,
    timeout: 60000, // Increase timeout for Mistral
    stream: false,
    models: [
      {
        id: "mistral:7b-instruct-q4_K_M",
        name: "Mistral 7B",
        supportsJsonMode: true,
        supportsSystemPrompt: false,
        supportsTemperature: true,
        maxContextTokens: 8192,
        recommendedMaxTokens: 6000, // Safe limit to avoid timeouts
        defaultTemperature: 0.7,
        description: "Good for smaller contexts, may timeout on large prompts",
        timeoutMs: 45000, // 45 second timeout
      },
    ],
  },

  {
    id: "home-deepseek",
    name: "Home Deepseek",
    url: `${process.env.PRIVATE_OLLAMA_HOME_URL_PUBLIC}/api/generate`,
    apiKey: process.env.PRIVATE_OLLAMA_HOME_PASS,
    priority: 1,
    healthCheckEndpoint: `${process.env.PRIVATE_OLLAMA_HOME_URL_PUBLIC}`,
    timeout: 60000, // Increase timeout for Mistral
    stream: false,
    models: [
      {
        id: "deepseek-r1:8b",
        name: "Deepseek R1",
        supportsJsonMode: true,
        supportsSystemPrompt: false,
        supportsTemperature: true,
        maxContextTokens: 8192,
        recommendedMaxTokens: 6000, // Safe limit to avoid timeouts
        defaultTemperature: 0.7,
        description: "Good for smaller contexts, may timeout on large prompts",
        timeoutMs: 45000, // 45 second timeout
      },
    ],
  },
  {
    id: "linode-qwen",
    name: "Linode Qwen Server",
    url: `${process.env.PRIVATE_LINODE_URL}/v1/chat/completions`,
    apiKey: process.env.PRIVATE_LINODE_PASS,
    priority: 2,
    timeout: 45000,
    stream: false,
    models: [
      {
        id: "qwen2.5:0.5b",
        name: "Qwen 2.5 0.5B",
        supportsJsonMode: true,
        supportsSystemPrompt: false,
        supportsTemperature: true,
        maxContextTokens: 32768,
        recommendedMaxTokens: 28000,
        defaultTemperature: 0.7,
        description: "Larger context window, good for medium-sized briefs",
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI ChatGPT",
    url: "https://api.openai.com/v1/chat/completions",
    apiKey: process.env.PRIVATE_OPENAI_API_KEY,
    priority: 3,
    timeout: 60000,
    stream: true,
    models: [
      {
        id: "gpt-4o-mini",
        name: "GPT-4O Mini",
        supportsJsonMode: true,
        supportsSystemPrompt: true,
        supportsTemperature: true,
        defaultTemperature: 0.3,
        description: "cheapest, huge context window",
        smartness: 2,
        inputCost: 0.15,
        maxContextTokens: 128000,
        recommendedMaxTokens: 120000,
      },
      {
        id: "gpt-4o",
        name: "GPT-4O",
        supportsJsonMode: true,
        supportsSystemPrompt: true,
        supportsTemperature: true,
        defaultTemperature: 0.3,
        description: "expensive, use sparingly",
        smartness: 3,
        inputCost: 2.5,
        maxContextTokens: 128000,
        recommendedMaxTokens: 120000,
      },
      {
        id: "o3-mini",
        name: "GPT-03 Mini",
        supportsJsonMode: true,
        supportsSystemPrompt: true,
        supportsTemperature: false,
        defaultTemperature: 0.3,
        description: "good balance of cost and performance",
        smartness: 4,
        inputCost: 1.1,
        maxContextTokens: 128000,
        recommendedMaxTokens: 120000,
      },
    ],
  },
];

// Context size recommendations for different brief types
export const BRIEF_CONTEXT_LIMITS = {
  // Individual project briefs
  projectBrief: {
    small: { maxTokens: 1000, useModel: "mistral:7b-instruct-q4_K_M" },
    medium: { maxTokens: 3000, useModel: "mistral:7b-instruct-q4_K_M" },
    large: { maxTokens: 6000, useModel: "qwen2.5:0.5b" },
  },

  // Main daily brief synthesis
  mainBrief: {
    few: {
      // 1-5 projects
      maxTokens: 5000,
      useModel: "mistral:7b-instruct-q4_K_M",
      strategy: "full_briefs",
    },
    several: {
      // 6-10 projects
      maxTokens: 15000,
      useModel: "qwen2.5:0.5b",
      strategy: "mixed_briefs",
    },
    many: {
      // 11+ projects
      maxTokens: 30000,
      useModel: "gpt-4o-mini",
      strategy: "condensed_briefs",
    },
  },

  // Condensed brief generation
  condensedBrief: {
    maxTokens: 1500,
    useModel: "mistral:7b-instruct-q4_K_M",
  },
};

// Helper function to select best model for token count
export function selectModelForTokenCount(
  estimatedTokens: number,
  preferredModels?: string[],
): string[] {
  const recommendations: string[] = [];

  // Add preferred models that can handle the token count
  if (preferredModels) {
    preferredModels.forEach((modelId) => {
      const model = findModelById(modelId);
      if (model && model.recommendedMaxTokens >= estimatedTokens) {
        recommendations.push(modelId);
      }
    });
  }

  // Add fallback models based on token requirements
  if (estimatedTokens < 6000) {
    recommendations.push("mistral:7b-instruct-q4_K_M");
  }

  if (estimatedTokens < 28000) {
    recommendations.push("qwen2.5:0.5b");
  }

  // Always include GPT as ultimate fallback
  recommendations.push("gpt-4o-mini");

  // Remove duplicates
  return [...new Set(recommendations)];
}

function findModelById(modelId: string): LLMModelWithLimits | null {
  for (const provider of defaultLLMConfig) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) {
      return model as LLMModelWithLimits;
    }
  }
  return null;
}
