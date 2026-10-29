// apps/mobile/src/app/+native-intent.ts
// Incoming links (custom scheme, Expo Go, universal links). A project link opens on the Workspace
// tab's stack: the project page is a shared route, and a cold start would otherwise pick Today,
// the first tab alphabetically. A warm link goes through the Workspace root, which pushes the
// project, so the grid is always underneath. Every other link passes through untouched.
import { projectLinkPath } from '@/lib/routes';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
	try {
		return projectLinkPath(path, initial) ?? path;
	} catch {
		// Throwing here can crash the app on launch; fall back to the link as given.
		return path;
	}
}
