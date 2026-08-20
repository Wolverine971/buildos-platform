import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export const PUBLIC_RAILWAY_WORKER_URL = publicEnv.PUBLIC_RAILWAY_WORKER_URL;
export const PRIVATE_RAILWAY_WORKER_TOKEN = privateEnv.PRIVATE_RAILWAY_WORKER_TOKEN;
export const PRIVATE_AGENTIC_CHAT_WORKER_URL = privateEnv.PRIVATE_AGENTIC_CHAT_WORKER_URL;
