-- Drop legacy agent research tables (deprecated agent-to-agent v1)
-- Order: child tables first, then parent session table.

drop table if exists agent_research_messages cascade;
drop table if exists agent_research_runs cascade;
drop table if exists agent_research_sessions cascade;
