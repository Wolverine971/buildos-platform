// apps/web/src/routes/projects/[id]/+page.server.ts
// Reuse the classic project loader so the new workspace exercises the same
// access checks, skeleton-first response, and real ontology data.
export { load } from '../../projects-old/[id]/+page.server';
