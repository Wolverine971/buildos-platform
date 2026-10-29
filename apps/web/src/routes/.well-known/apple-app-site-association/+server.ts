// apps/web/src/routes/.well-known/apple-app-site-association/+server.ts
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { buildAppleAppSiteAssociation, trustFileResponse } from '$lib/server/app-site-association';

// Apple fetches this once per install through its CDN; it must be JSON with no redirect.
export const GET: RequestHandler = () => trustFileResponse(buildAppleAppSiteAssociation(env));
