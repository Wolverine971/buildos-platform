-- Allow milestones to be created without a due date
alter table onto_milestones alter column due_at drop not null;
