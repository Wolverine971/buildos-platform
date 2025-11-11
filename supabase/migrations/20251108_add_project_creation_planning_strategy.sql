-- supabase/migrations/20251108_add_project_creation_planning_strategy.sql

alter type planning_strategy add value if not exists 'project_creation';
