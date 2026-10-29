// apps/web/src/routes/.well-known/assetlinks.json/+server.ts
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { buildAndroidAssetLinks, trustFileResponse } from '$lib/server/app-site-association';

export const GET: RequestHandler = () => trustFileResponse(buildAndroidAssetLinks(env));
