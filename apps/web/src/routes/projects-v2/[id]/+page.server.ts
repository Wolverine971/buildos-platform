// apps/web/src/routes/projects-v2/[id]/+page.server.ts
// Reuse the production project loader so the prototype exercises the same
// access checks, skeleton-first response, and real ontology data as /projects/[id].
export { load } from '../../projects/[id]/+page.server';
