-- supabase/migrations/20250603000001_fix_documents_schema.sql
-- Migration: Fix onto_documents schema to support FSM
-- Date: 2025-11-03
-- Purpose: Add state_key and updated_at columns to onto_documents table
--          to enable FSM transitions on documents

-- Add state_key column for FSM support
alter table onto_documents
  add column if not exists state_key text not null default 'draft';

-- Add updated_at column for audit trail
alter table onto_documents
  add column if not exists updated_at timestamptz not null default now();

-- Create index on state_key for query performance
create index if not exists idx_onto_documents_state on onto_documents(state_key);

-- Create trigger to auto-update updated_at timestamp
create or replace function update_onto_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_onto_documents_updated_at
  before update on onto_documents
  for each row
  execute function update_onto_documents_updated_at();

-- Add comment explaining the schema
comment on column onto_documents.state_key is 'FSM state for document workflow (draft, review, approved, published, etc.)';
comment on column onto_documents.updated_at is 'Timestamp of last update, auto-updated by trigger';
