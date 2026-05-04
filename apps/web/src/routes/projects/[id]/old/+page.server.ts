// apps/web/src/routes/projects/[id]/old/+page.server.ts
/**
 * Legacy project detail page (the pre-redesign workspace).
 *
 * Reachable at /projects/[id]/old. The new workspace lives at /projects/[id]
 * and uses the same loader, so we just re-export it here.
 */

export { load } from '../+page.server';
export type { ProjectSkeletonData } from '../+page.server';
