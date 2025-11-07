-- Migration: Update planning strategy enum to match ChatStrategy values
-- Date: 2025-11-06
-- Description: Replace legacy 'direct'/'complex' enum with chat strategy labels

ALTER TYPE planning_strategy RENAME TO planning_strategy_old;

-- Convert existing enum column to text so we can remap freely
ALTER TABLE agent_plans
ALTER COLUMN strategy TYPE text
USING strategy::text;

-- Create new enum aligned with ChatStrategy outputs
CREATE TYPE planning_strategy AS ENUM (
    'simple_research',
    'complex_research',
    'ask_clarifying_questions'
);

-- Migrate existing agent plan rows to new enum
ALTER TABLE agent_plans
ALTER COLUMN strategy TYPE planning_strategy
USING (
    CASE
        WHEN strategy IN ('direct', 'simple', 'tool_use') THEN 'simple_research'::planning_strategy
        WHEN strategy = 'complex' THEN 'complex_research'::planning_strategy
        WHEN strategy = 'ask_clarifying_questions' THEN 'ask_clarifying_questions'::planning_strategy
        ELSE 'simple_research'::planning_strategy
    END
);

-- Drop legacy enum
DROP TYPE planning_strategy_old;

COMMENT ON TYPE planning_strategy IS 'Planner strategies selected by the LLM (simple/complex/clarifying research)';
COMMENT ON COLUMN agent_plans.strategy IS 'Planner strategy used when generating the plan';
