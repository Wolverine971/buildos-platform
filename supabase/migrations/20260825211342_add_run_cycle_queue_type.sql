-- Cycles use one generic queue envelope. Domain routing happens from the
-- immutable cycle_run record, not from a growing list of queue job types.
--
-- Keep this enum change in its own migration so subsequent migrations can use
-- the new value safely across Postgres versions and migration runners.
ALTER TYPE public.queue_type
	ADD VALUE IF NOT EXISTS 'run_cycle';
