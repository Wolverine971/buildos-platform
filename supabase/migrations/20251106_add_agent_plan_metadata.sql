-- Migration: Add metadata column to agent_plans
-- Created: 2025-11-06
-- Description: Allows storing structured telemetry for generated agent plans

ALTER TABLE agent_plans
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN agent_plans.metadata IS 'Plan-level metadata (durations, token usage, tool stats)';
