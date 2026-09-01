-- libri-migration: true
-- Libri phase 5: cover the composite provider-cost step foreign key before
-- multi-image batches increase reservation and step-delete traffic.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE INDEX provider_cost_reservations_step_fk_idx
	ON libri.provider_cost_reservations (library_id, run_id, step_id);

RESET statement_timeout;
RESET lock_timeout;
