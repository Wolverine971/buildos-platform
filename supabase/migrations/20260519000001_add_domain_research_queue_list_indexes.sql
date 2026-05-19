-- supabase/migrations/20260519000001_add_domain_research_queue_list_indexes.sql
-- List-page indexes for the BuildOS domain research queue.

create index if not exists idx_domain_research_queue_last_seen
	on public.domain_research_queue(last_seen_at desc, occurrences desc);

create index if not exists idx_domain_research_queue_kind_seen
	on public.domain_research_queue(kind, last_seen_at desc);

create index if not exists idx_domain_research_queue_priority_seen
	on public.domain_research_queue(priority, last_seen_at desc);
