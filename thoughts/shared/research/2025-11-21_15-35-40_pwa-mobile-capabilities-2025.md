---
title: "PWA Features and Mobile-Specific Capabilities for 2025"
date: 2025-11-21
author: Claude
tags: [pwa, mobile, research, sveltekit, ios, android, web-apis]
status: complete
context: "SvelteKit app with basic PWA setup (manifest, icons), researching mobile experience enhancements"
research_focus:
  - PWA best practices for 2025
  - Mobile device capabilities (haptics, gestures, orientation)
  - Offline-first strategies
  - Mobile-specific APIs
  - iOS Safari and Chrome Android features
  - Touch and gesture APIs
  - Mobile input enhancements
  - Pull-to-refresh patterns
  - Mobile security considerations
path: thoughts/shared/research/2025-11-21_15-35-40_pwa-mobile-capabilities-2025.md
---

# PWA Features and Mobile-Specific Capabilities for 2025

## Executive Summary

This research document provides a comprehensive overview of Progressive Web App (PWA) features and mobile-specific capabilities as of 2025, focusing on practical implementation for a SvelteKit-based application. The document covers modern PWA best practices, mobile device APIs, offline-first strategies, platform-specific features for iOS Safari and Chrome Android, touch/gesture handling, input optimization, and security considerations.

**Key Findings:**
- **@vite-pwa/sveltekit** is the recommended zero-config solution for SvelteKit PWA implementation
- **Pointer Events API** (Level 2) is now universally supported and should replace Touch Events
- **iOS Safari** continues to have unique quirks and limitations, but iOS 18/Safari 26 brings significant improvements
- **Workbox 7** remains the industry standard for service worker management
- **Progressive enhancement** is critical—design for offline first, treat network as enhancement

---

## Table of Contents

1. [PWA Best Practices for 2025](#pwa-best-practices-2025)
2. [Mobile Device Capabilities](#mobile-device-capabilities)
3. [Offline-First Strategies](#offline-first-strategies)
4. [Mobile-Specific Web APIs](#mobile-specific-web-apis)
5. [iOS Safari Specifics](#ios-safari-specifics)
6. [Touch and Gesture APIs](#touch-and-gesture-apis)
7. [Mobile Input Optimization](#mobile-input-optimization)
8. [Pull-to-Refresh Implementation](#pull-to-refresh-implementation)
9. [Security Best Practices](#security-best-practices)
10. [Implementation Checklists](#implementation-checklists)
11. [Resources and References](#resources-and-references)

---

## PWA Best Practices 2025

### Modern PWA Setup with SvelteKit

**Recommended Tool: @vite-pwa/sveltekit**
- Zero-config PWA plugin specifically for SvelteKit
- Built-in support for install prompts
- Automatic service worker generation
- Preconfigured manifest and icons

**Installation:**
```bash
pnpm add -D @vite-pwa/sveltekit
```

**Configuration (svelte.config.js):**
```javascript
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default {
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'BuildOS',
        short_name: 'BuildOS',
        description: 'AI-powered productivity platform',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Brain Dump',
            short_name: 'Dump',
            description: 'Quick brain dump entry',
            url: '/brain-dump',
            icons: [{ src: '/icon-brain-dump.png', sizes: '192x192' }]
          }
        ]
      }
    })
  ]
};
```

### Install Prompt Best Practices

**Custom Install Button (Recommended Pattern):**
```typescript
// src/lib/stores/pwa.ts
import { writable } from 'svelte/store';

export const deferredPrompt = writable<BeforeInstallPromptEvent | null>(null);
export const isInstallable = writable(false);

// Listen for beforeinstallprompt event
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Prevent default mini-infobar
    deferredPrompt.set(e as BeforeInstallPromptEvent);
    isInstallable.set(true);
  });

  // Detect if already installed
  window.addEventListener('appinstalled', () => {
    isInstallable.set(false);
    deferredPrompt.set(null);
  });
}
```

**Install Button Component:**
```svelte
<!-- src/lib/components/InstallButton.svelte -->
<script lang="ts">
  import { deferredPrompt, isInstallable } from '$lib/stores/pwa';

  async function handleInstall() {
    const prompt = $deferredPrompt;
    if (!prompt) return;

    prompt.prompt();
    const { outcome } = await prompt.userChoice;

    if (outcome === 'accepted') {
      console.log('PWA installed');
    }

    deferredPrompt.set(null);
    isInstallable.set(false);
  }
</script>

{#if $isInstallable}
  <button on:click={handleInstall} class="install-button">
    Install App
  </button>
{/if}
```

### Manifest Configuration Best Practices

**Essential Manifest Fields (2025):**
```json
{
  "name": "BuildOS Platform",
  "short_name": "BuildOS",
  "description": "AI-powered productivity platform",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "theme_color": "#1a1a1a",
  "background_color": "#1a1a1a",
  "categories": ["productivity", "utilities"],
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "shortcuts": [
    {
      "name": "Brain Dump",
      "short_name": "Dump",
      "description": "Quick brain dump entry",
      "url": "/brain-dump",
      "icons": [{ "src": "/icons/brain-dump.png", "sizes": "192x192" }]
    },
    {
      "name": "Today's Tasks",
      "short_name": "Tasks",
      "description": "View today's tasks",
      "url": "/tasks/today",
      "icons": [{ "src": "/icons/tasks.png", "sizes": "192x192" }]
    }
  ],
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [
        {
          "name": "media",
          "accept": ["image/*", "video/*", "audio/*"]
        }
      ]
    }
  }
}
```

**Key Considerations:**
- **Purpose "any" vs "maskable"**: Provide both for best cross-platform support
- **Shortcuts**: Maximum 4 shortcuts, use for high-frequency actions
- **Share Target**: Enables receiving shared content from other apps (Android only)
- **Categories**: Help app stores categorize your PWA

---

## Mobile Device Capabilities

### Haptic Feedback (Vibration API)

**Modern Haptics vs. Simple Vibration:**
- **Vibration**: Crude buzzing (legacy)
- **Haptics**: Nuanced tactile feedback with controlled, varied sensations (taps, clicks, textures)

**Browser Support (2025):**
- ✅ Chrome Android: Full support
- ✅ Firefox Android: Full support
- ⚠️ iOS Safari: Basic support (single vibration patterns only)

**Implementation:**
```typescript
// src/lib/utils/haptics.ts

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 30,
  success: [10, 100, 10],
  warning: [20, 100, 20, 100, 20],
  error: [30, 100, 30]
};

export class HapticsManager {
  private enabled: boolean = true;
  private supported: boolean = false;

  constructor() {
    this.supported = 'vibrate' in navigator;
    this.loadSettings();
  }

  private loadSettings() {
    const setting = localStorage.getItem('haptics-enabled');
    this.enabled = setting !== 'false'; // Default to enabled
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    localStorage.setItem('haptics-enabled', enabled.toString());
  }

  vibrate(pattern: HapticPattern) {
    if (!this.supported || !this.enabled) return;

    try {
      const vibrationPattern = HAPTIC_PATTERNS[pattern];
      navigator.vibrate(vibrationPattern);
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }

  // Convenience methods
  tap() { this.vibrate('light'); }
  click() { this.vibrate('medium'); }
  longPress() { this.vibrate('heavy'); }
  success() { this.vibrate('success'); }
  warning() { this.vibrate('warning'); }
  error() { this.vibrate('error'); }

  cancel() {
    if (this.supported) {
      navigator.vibrate(0);
    }
  }
}

// Singleton instance
export const haptics = new HapticsManager();
```

**Usage in Components:**
```svelte
<script lang="ts">
  import { haptics } from '$lib/utils/haptics';

  function handleButtonClick() {
    haptics.click();
    // ... rest of logic
  }

  function handleSuccess() {
    haptics.success();
    showSuccessMessage();
  }
</script>

<button on:click={handleButtonClick}>
  Click Me
</button>
```

**Best Practices:**
- ⚠️ **Less is more**: Too much vibration is annoying and numbing
- ✅ **Provide user control**: Offer On, Minimal, and Off settings
- ✅ **Central management**: Manage all haptic calls centrally with capability checks
- ✅ **Test on real devices**: Validate feel across different devices with user feedback
- ✅ **Context-appropriate**: Use light haptics for UI interactions, heavier for important events

**User Settings Component:**
```svelte
<!-- src/lib/components/settings/HapticSettings.svelte -->
<script lang="ts">
  import { haptics } from '$lib/utils/haptics';

  let enabled = $state(true);

  function toggleHaptics() {
    enabled = !enabled;
    haptics.setEnabled(enabled);
    if (enabled) {
      haptics.click(); // Test vibration
    }
  }
</script>

<div class="setting-row">
  <label>
    <span>Haptic Feedback</span>
    <input
      type="checkbox"
      bind:checked={enabled}
      on:change={toggleHaptics}
    />
  </label>
  <p class="description">
    Vibration feedback for interactions
  </p>
</div>
```

### Device Orientation and Motion

**APIs Available:**
- `DeviceOrientationEvent`: Alpha, beta, gamma rotation
- `DeviceMotionEvent`: Acceleration, rotation rate
- `Screen.orientation`: Screen orientation lock/unlock

**Implementation:**
```typescript
// src/lib/utils/device-motion.ts

export interface OrientationData {
  alpha: number | null; // 0-360 (compass direction)
  beta: number | null;  // -180 to 180 (front-to-back tilt)
  gamma: number | null; // -90 to 90 (left-to-right tilt)
}

export interface MotionData {
  acceleration: { x: number; y: number; z: number } | null;
  accelerationIncludingGravity: { x: number; y: number; z: number } | null;
  rotationRate: { alpha: number; beta: number; gamma: number } | null;
  interval: number;
}

export class DeviceMotionManager {
  private orientationCallback?: (data: OrientationData) => void;
  private motionCallback?: (data: MotionData) => void;

  async requestPermission(): Promise<boolean> {
    // iOS 13+ requires explicit permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        return permission === 'granted';
      } catch (error) {
        console.error('Permission request failed:', error);
        return false;
      }
    }
    return true; // Android doesn't require permission
  }

  startOrientationTracking(callback: (data: OrientationData) => void) {
    this.orientationCallback = callback;
    window.addEventListener('deviceorientation', this.handleOrientation);
  }

  startMotionTracking(callback: (data: MotionData) => void) {
    this.motionCallback = callback;
    window.addEventListener('devicemotion', this.handleMotion);
  }

  private handleOrientation = (event: DeviceOrientationEvent) => {
    if (this.orientationCallback) {
      this.orientationCallback({
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma
      });
    }
  };

  private handleMotion = (event: DeviceMotionEvent) => {
    if (this.motionCallback) {
      this.motionCallback({
        acceleration: event.acceleration,
        accelerationIncludingGravity: event.accelerationIncludingGravity,
        rotationRate: event.rotationRate,
        interval: event.interval
      });
    }
  };

  stopOrientationTracking() {
    window.removeEventListener('deviceorientation', this.handleOrientation);
    this.orientationCallback = undefined;
  }

  stopMotionTracking() {
    window.removeEventListener('devicemotion', this.handleMotion);
    this.motionCallback = undefined;
  }

  async lockOrientation(orientation: OrientationLockType): Promise<boolean> {
    try {
      await screen.orientation.lock(orientation);
      return true;
    } catch (error) {
      console.error('Orientation lock failed:', error);
      return false;
    }
  }

  unlockOrientation() {
    try {
      screen.orientation.unlock();
    } catch (error) {
      console.error('Orientation unlock failed:', error);
    }
  }

  getCurrentOrientation(): OrientationType {
    return screen.orientation.type;
  }
}

export const deviceMotion = new DeviceMotionManager();
```

**Usage Example (Shake Detection):**
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { deviceMotion } from '$lib/utils/device-motion';

  let shakeCount = $state(0);
  let lastShakeTime = 0;
  const SHAKE_THRESHOLD = 15;
  const SHAKE_TIMEOUT = 500;

  onMount(async () => {
    const granted = await deviceMotion.requestPermission();
    if (!granted) return;

    deviceMotion.startMotionTracking((data) => {
      if (!data.accelerationIncludingGravity) return;

      const { x, y, z } = data.accelerationIncludingGravity;
      const acceleration = Math.sqrt(x * x + y * y + z * z);

      if (acceleration > SHAKE_THRESHOLD) {
        const now = Date.now();
        if (now - lastShakeTime > SHAKE_TIMEOUT) {
          shakeCount++;
          lastShakeTime = now;
          handleShake();
        }
      }
    });

    return () => {
      deviceMotion.stopMotionTracking();
    };
  });

  function handleShake() {
    console.log('Device shaken!');
    // Trigger undo, refresh, or other action
  }
</script>

<p>Shake count: {shakeCount}</p>
```

---

## Offline-First Strategies

### Service Worker Caching Strategies

**Strategy Matrix:**

| Content Type | Strategy | Rationale |
|-------------|----------|-----------|
| App shell (HTML, CSS, JS) | Cache-first | Static, rarely changes |
| Images, fonts | Cache-first | Large assets, static |
| API data (user-specific) | Network-first | Dynamic, needs freshness |
| API data (public) | Stale-while-revalidate | Balance speed and freshness |
| Analytics, tracking | Network-only | No offline value |

**Implementation with Workbox 7:**
```typescript
// src/service-worker.ts
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import {
  CacheFirst,
  NetworkFirst,
  StaleWhileRevalidate,
  NetworkOnly
} from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache build artifacts
precacheAndRoute(self.__WB_MANIFEST);

// Cache-first for static assets
registerRoute(
  ({ request }) => request.destination === 'style' ||
                   request.destination === 'script' ||
                   request.destination === 'worker',
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
      })
    ]
  })
);

// Cache-first for images with size limit
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 24 * 60 * 60, // 60 days
        // Limit cache size to 50MB
        purgeOnQuotaError: true
      })
    ]
  })
);

// Network-first for API calls
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60 // 5 minutes
      })
    ]
  })
);

// Stale-while-revalidate for fonts
registerRoute(
  ({ request }) => request.destination === 'font',
  new StaleWhileRevalidate({
    cacheName: 'fonts',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
      })
    ]
  })
);

// Network-only for analytics
registerRoute(
  ({ url }) => url.hostname === 'www.google-analytics.com',
  new NetworkOnly()
);

// Offline fallback page
import { setCatchHandler } from 'workbox-routing';

setCatchHandler(async ({ event }) => {
  if (event.request.destination === 'document') {
    return caches.match('/offline.html');
  }
  return Response.error();
});
```

### Background Sync API

**Use Case:** Queue failed requests when offline, sync when online

**Implementation:**
```typescript
// src/lib/services/background-sync.ts
import { openDB, type IDBPDatabase } from 'idb';

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
}

class BackgroundSyncManager {
  private db: IDBPDatabase | null = null;
  private readonly DB_NAME = 'buildos-sync';
  private readonly STORE_NAME = 'queued-requests';

  async init() {
    this.db = await openDB(this.DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('queued-requests')) {
          db.createObjectStore('queued-requests', { keyPath: 'id' });
        }
      }
    });
  }

  async queueRequest(url: string, options: RequestInit = {}) {
    if (!this.db) await this.init();

    const request: QueuedRequest = {
      id: crypto.randomUUID(),
      url,
      method: options.method || 'GET',
      headers: this.headersToObject(options.headers),
      body: options.body ? await this.bodyToString(options.body) : undefined,
      timestamp: Date.now()
    };

    await this.db!.put(this.STORE_NAME, request);

    // Register sync event if available
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('sync-queued-requests');
    } else {
      // Fallback: Try immediately if online
      if (navigator.onLine) {
        this.processQueue();
      }
    }

    return request.id;
  }

  async processQueue() {
    if (!this.db) await this.init();

    const requests = await this.db!.getAll(this.STORE_NAME);

    for (const request of requests) {
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body
        });

        if (response.ok) {
          await this.db!.delete(this.STORE_NAME, request.id);
          console.log(`Successfully synced request: ${request.id}`);
        }
      } catch (error) {
        console.error(`Failed to sync request ${request.id}:`, error);
        // Keep in queue for retry
      }
    }
  }

  private headersToObject(headers?: HeadersInit): Record<string, string> {
    const obj: Record<string, string> = {};
    if (!headers) return obj;

    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        obj[key] = value;
      });
    } else if (Array.isArray(headers)) {
      headers.forEach(([key, value]) => {
        obj[key] = value;
      });
    } else {
      Object.assign(obj, headers);
    }

    return obj;
  }

  private async bodyToString(body: BodyInit): Promise<string> {
    if (typeof body === 'string') return body;
    if (body instanceof Blob) return await body.text();
    if (body instanceof FormData) {
      // Convert FormData to JSON
      const obj: Record<string, any> = {};
      body.forEach((value, key) => {
        obj[key] = value;
      });
      return JSON.stringify(obj);
    }
    return '';
  }
}

export const backgroundSync = new BackgroundSyncManager();
```

**Service Worker Handler:**
```typescript
// src/service-worker.ts (additional code)
import { openDB } from 'idb';

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-queued-requests') {
    event.waitUntil(syncQueuedRequests());
  }
});

async function syncQueuedRequests() {
  const db = await openDB('buildos-sync', 1);
  const requests = await db.getAll('queued-requests');

  const syncPromises = requests.map(async (request) => {
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });

      if (response.ok) {
        await db.delete('queued-requests', request.id);

        // Notify client of successful sync
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_SUCCESS',
            requestId: request.id
          });
        });
      }
    } catch (error) {
      console.error('Sync failed for request:', request.id, error);
    }
  });

  await Promise.allSettled(syncPromises);
}
```

**Usage in App:**
```typescript
// src/lib/services/api-client.ts
import { backgroundSync } from '$lib/services/background-sync';

export async function apiPost(url: string, data: any) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Request failed');
    return await response.json();
  } catch (error) {
    if (!navigator.onLine) {
      // Queue for background sync
      console.log('Offline: Queueing request for later sync');
      const requestId = await backgroundSync.queueRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      return { queued: true, requestId };
    }
    throw error;
  }
}
```

### IndexedDB for Offline Data

**Best Practices:**
- ⚠️ **Never use localStorage** for application data (synchronous, blocking, size limits)
- ✅ **Use IndexedDB** for all serious offline data persistence
- ✅ **Use idb library** for Promise-based API (wrapper around IndexedDB)
- ✅ **Version your database** for schema migrations
- ✅ **Handle quota errors** gracefully

**Implementation Example:**
```typescript
// src/lib/db/tasks-db.ts
import { openDB, type IDBPDatabase } from 'idb';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  created_at: number;
  updated_at: number;
  synced: boolean;
}

class TasksDatabase {
  private db: IDBPDatabase | null = null;
  private readonly DB_NAME = 'buildos-tasks';
  private readonly VERSION = 1;

  async init() {
    this.db = await openDB(this.DB_NAME, this.VERSION, {
      upgrade(db, oldVersion, newVersion) {
        // Version 1: Initial schema
        if (oldVersion < 1) {
          const tasksStore = db.createObjectStore('tasks', { keyPath: 'id' });
          tasksStore.createIndex('status', 'status');
          tasksStore.createIndex('synced', 'synced');
          tasksStore.createIndex('updated_at', 'updated_at');
        }
      },
      blocked() {
        console.warn('Database blocked by another connection');
      },
      blocking() {
        console.warn('This connection is blocking a version upgrade');
      }
    });
  }

  async ensureDb() {
    if (!this.db) await this.init();
    return this.db!;
  }

  async getAllTasks(): Promise<Task[]> {
    const db = await this.ensureDb();
    return db.getAll('tasks');
  }

  async getTaskById(id: string): Promise<Task | undefined> {
    const db = await this.ensureDb();
    return db.get('tasks', id);
  }

  async getTasksByStatus(status: Task['status']): Promise<Task[]> {
    const db = await this.ensureDb();
    return db.getAllFromIndex('tasks', 'status', status);
  }

  async getUnsyncedTasks(): Promise<Task[]> {
    const db = await this.ensureDb();
    return db.getAllFromIndex('tasks', 'synced', false);
  }

  async addTask(task: Omit<Task, 'created_at' | 'updated_at' | 'synced'>): Promise<Task> {
    const db = await this.ensureDb();
    const now = Date.now();
    const newTask: Task = {
      ...task,
      created_at: now,
      updated_at: now,
      synced: false
    };
    await db.put('tasks', newTask);
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const db = await this.ensureDb();
    const task = await db.get('tasks', id);
    if (!task) return null;

    const updatedTask: Task = {
      ...task,
      ...updates,
      updated_at: Date.now(),
      synced: false
    };
    await db.put('tasks', updatedTask);
    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    const db = await this.ensureDb();
    await db.delete('tasks', id);
    return true;
  }

  async markTaskSynced(id: string): Promise<void> {
    const db = await this.ensureDb();
    const task = await db.get('tasks', id);
    if (task) {
      task.synced = true;
      await db.put('tasks', task);
    }
  }

  async clearAllTasks(): Promise<void> {
    const db = await this.ensureDb();
    await db.clear('tasks');
  }

  async getStorageEstimate(): Promise<{ usage?: number; quota?: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      return await navigator.storage.estimate();
    }
    return {};
  }
}

export const tasksDb = new TasksDatabase();
```

---

## Mobile-Specific Web APIs

### Web Share API

**Use Case:** Share content from your PWA to native apps

**Browser Support:**
- ✅ Chrome Android 76+
- ✅ Safari iOS 12.2+
- ⚠️ Desktop: Safari 12.1+, limited Chrome support

**Implementation:**
```typescript
// src/lib/utils/web-share.ts

export interface ShareData {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}

export class WebShareManager {
  canShare(data?: ShareData): boolean {
    if (!navigator.share) return false;

    if (data?.files && data.files.length > 0) {
      return navigator.canShare?.(data) ?? false;
    }

    return true;
  }

  async share(data: ShareData): Promise<boolean> {
    if (!this.canShare(data)) {
      console.warn('Web Share API not supported or data not shareable');
      return false;
    }

    try {
      await navigator.share(data);
      return true;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('User cancelled share');
      } else {
        console.error('Share failed:', error);
      }
      return false;
    }
  }

  async shareText(text: string, title?: string): Promise<boolean> {
    return this.share({ text, title });
  }

  async shareUrl(url: string, title?: string, text?: string): Promise<boolean> {
    return this.share({ url, title, text });
  }

  async shareFiles(files: File[], title?: string, text?: string): Promise<boolean> {
    return this.share({ files, title, text });
  }

  // Fallback for unsupported browsers
  async copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Clipboard write failed:', error);
      return false;
    }
  }
}

export const webShare = new WebShareManager();
```

**Component Usage:**
```svelte
<script lang="ts">
  import { webShare } from '$lib/utils/web-share';

  let task = $state({
    id: '123',
    title: 'Complete project proposal',
    url: 'https://buildos.app/tasks/123'
  });

  async function handleShare() {
    const success = await webShare.share({
      title: task.title,
      url: task.url,
      text: `Check out this task: ${task.title}`
    });

    if (!success && !webShare.canShare()) {
      // Fallback: Copy to clipboard
      const copied = await webShare.copyToClipboard(task.url);
      if (copied) {
        alert('Link copied to clipboard!');
      }
    }
  }
</script>

<button on:click={handleShare} disabled={!webShare.canShare()}>
  {#if webShare.canShare()}
    Share Task
  {:else}
    Copy Link
  {/if}
</button>
```

### Web Share Target API

**Use Case:** Receive shared content from other apps (PWA acts as share target)

**Browser Support:**
- ✅ Chrome Android 76+
- ❌ iOS Safari: Not supported

**Manifest Configuration:**
```json
{
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [
        {
          "name": "media",
          "accept": ["image/*", "video/*", "audio/*", "application/pdf"]
        }
      ]
    }
  }
}
```

**Server Route Handler:**
```typescript
// src/routes/share/+server.ts
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const formData = await request.formData();

  const title = formData.get('title') as string;
  const text = formData.get('text') as string;
  const url = formData.get('url') as string;
  const media = formData.getAll('media') as File[];

  // Process shared content
  console.log('Received share:', { title, text, url, mediaCount: media.length });

  // Store in database, create brain dump, etc.
  const { data, error } = await locals.supabase
    .from('brain_dumps')
    .insert({
      user_id: (await locals.getSession())?.user?.id,
      content: text || url || title || '',
      source: 'shared_content'
    });

  // Redirect to appropriate page
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/brain-dump?shared=true'
    }
  });
};
```

### Notifications and Badging API

**Browser Support:**
- ✅ Chrome Android: Full support
- ✅ Safari iOS: Partial support (Safari 16.4+)
- ⚠️ iOS: Requires PWA installed to home screen

**Implementation:**
```typescript
// src/lib/services/notifications.ts

export class NotificationManager {
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return 'denied';
    }
    return await Notification.requestPermission();
  }

  async showNotification(title: string, options?: NotificationOptions): Promise<void> {
    const permission = await this.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission not granted');
      return;
    }

    // Use service worker for better reliability
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  }

  async showTaskReminder(task: { title: string; id: string }): Promise<void> {
    await this.showNotification(`Reminder: ${task.title}`, {
      body: 'Tap to view task details',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: `task-${task.id}`,
      requireInteraction: false,
      data: { taskId: task.id, type: 'task_reminder' },
      actions: [
        { action: 'view', title: 'View Task' },
        { action: 'complete', title: 'Mark Complete' }
      ]
    });
  }

  async setBadgeCount(count: number): Promise<void> {
    if ('setAppBadge' in navigator) {
      try {
        await (navigator as any).setAppBadge(count);
      } catch (error) {
        console.error('Failed to set app badge:', error);
      }
    }
  }

  async clearBadge(): Promise<void> {
    if ('clearAppBadge' in navigator) {
      try {
        await (navigator as any).clearAppBadge();
      } catch (error) {
        console.error('Failed to clear app badge:', error);
      }
    }
  }
}

export const notifications = new NotificationManager();
```

**Service Worker Notification Handler:**
```typescript
// src/service-worker.ts (additional code)

self.addEventListener('notificationclick', (event: any) => {
  event.notification.close();

  const data = event.notification.data;
  const action = event.action;

  if (action === 'view' && data.taskId) {
    event.waitUntil(
      clients.openWindow(`/tasks/${data.taskId}`)
    );
  } else if (action === 'complete' && data.taskId) {
    event.waitUntil(
      fetch(`/api/tasks/${data.taskId}/complete`, { method: 'POST' })
    );
  } else {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

self.addEventListener('push', (event: any) => {
  const data = event.data?.json() ?? {};

  event.waitUntil(
    self.registration.showNotification(data.title || 'BuildOS', {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: '/badge-72.png',
      data: data.data
    })
  );
});
```

### Contact Picker API

**Browser Support:**
- ✅ Chrome Android 80+ (Android M or later)
- ⚠️ Safari iOS: Experimental (requires manual enable)

**Implementation:**
```typescript
// src/lib/utils/contact-picker.ts

export interface ContactInfo {
  name?: string[];
  email?: string[];
  tel?: string[];
  address?: string[];
  icon?: Blob[];
}

export class ContactPickerManager {
  isSupported(): boolean {
    return 'contacts' in navigator && 'ContactsManager' in window;
  }

  async getSupportedProperties(): Promise<string[]> {
    if (!this.isSupported()) return [];
    const contactsManager = (navigator as any).contacts;
    return await contactsManager.getProperties();
  }

  async selectContacts(
    properties: string[] = ['name', 'email', 'tel'],
    options?: { multiple?: boolean }
  ): Promise<ContactInfo[]> {
    if (!this.isSupported()) {
      throw new Error('Contact Picker API not supported');
    }

    try {
      const contactsManager = (navigator as any).contacts;
      const contacts = await contactsManager.select(properties, options);
      return contacts;
    } catch (error) {
      console.error('Contact picker failed:', error);
      throw error;
    }
  }

  async selectSingleContact(
    properties: string[] = ['name', 'email', 'tel']
  ): Promise<ContactInfo | null> {
    const contacts = await this.selectContacts(properties, { multiple: false });
    return contacts[0] || null;
  }
}

export const contactPicker = new ContactPickerManager();
```

**Usage Example:**
```svelte
<script lang="ts">
  import { contactPicker } from '$lib/utils/contact-picker';

  let selectedContact = $state<any>(null);

  async function pickContact() {
    if (!contactPicker.isSupported()) {
      alert('Contact Picker not supported on this device');
      return;
    }

    try {
      const contact = await contactPicker.selectSingleContact(['name', 'email', 'tel']);
      selectedContact = contact;
      console.log('Selected contact:', contact);
    } catch (error) {
      console.error('Contact selection cancelled or failed:', error);
    }
  }
</script>

<button on:click={pickContact}>
  Pick Contact
</button>

{#if selectedContact}
  <div class="contact-info">
    <p>Name: {selectedContact.name?.[0]}</p>
    <p>Email: {selectedContact.email?.[0]}</p>
    <p>Phone: {selectedContact.tel?.[0]}</p>
  </div>
{/if}
```

---

## iOS Safari Specifics

### Safe Area Insets

**The Problem:**
iOS devices with notches, rounded corners, and home indicators require safe area handling to prevent content from being obscured.

**Solution:**
```css
/* global.css */

/* Enable safe area support */
html {
  /* Extend content into safe areas */
  viewport-fit: cover;
}

body {
  /* Respect safe areas with padding */
  padding-top: env(safe-area-inset-top);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
}

/* For fixed headers */
.header-fixed {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  padding-top: env(safe-area-inset-top);
  background: var(--header-bg);
}

/* For fixed bottom navigation */
.nav-bottom-fixed {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--nav-bg);
}

/* Combined with custom padding */
.button-with-safe-area {
  padding: calc(12px + env(safe-area-inset-top)) 16px;
}
```

**Meta Tag Requirements:**
```html
<!-- src/app.html -->
<head>
  <!-- Required for safe area support -->
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

  <!-- PWA-specific meta tags for iOS -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="BuildOS" />

  <!-- Icons for iOS -->
  <link rel="apple-touch-icon" href="/apple-touch-icon-180.png" />
  <link rel="apple-touch-startup-image" href="/splash-1125x2436.png"
        media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" />
</head>
```

**Safe Area Detection:**
```typescript
// src/lib/utils/safe-area.ts

export function getSafeAreaInsets() {
  if (typeof window === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };

  const computedStyle = getComputedStyle(document.documentElement);

  return {
    top: parseInt(computedStyle.getPropertyValue('--sat') || '0', 10),
    right: parseInt(computedStyle.getPropertyValue('--sar') || '0', 10),
    bottom: parseInt(computedStyle.getPropertyValue('--sab') || '0', 10),
    left: parseInt(computedStyle.getPropertyValue('--sal') || '0', 10)
  };
}

export function hasSafeAreaInsets(): boolean {
  const insets = getSafeAreaInsets();
  return insets.top > 0 || insets.bottom > 0 || insets.left > 0 || insets.right > 0;
}

// Make CSS custom properties available
if (typeof window !== 'undefined') {
  const root = document.documentElement;
  root.style.setProperty('--sat', `env(safe-area-inset-top, 0px)`);
  root.style.setProperty('--sar', `env(safe-area-inset-right, 0px)`);
  root.style.setProperty('--sab', `env(safe-area-inset-bottom, 0px)`);
  root.style.setProperty('--sal', `env(safe-area-inset-left, 0px)`);
}
```

### iOS Safari Quirks and Workarounds

**Common Issues:**

1. **Safe area insets report 0px in portrait mode**
   - **Workaround**: Only landscape mode shows safe area insets properly
   - **Solution**: Design UI assuming no safe area in portrait, test thoroughly in landscape

2. **Fixed positioning with `top: 0` renders 20px below screen top**
   - **Cause**: Status bar height not accounted for
   - **Solution**: Use `padding-top: env(safe-area-inset-top)` instead of `top: 0`

3. **White bar appears at bottom in standalone mode**
   - **Cause**: Document moved "up" due to safe area handling
   - **Solution**: Set minimum height including safe area
   ```css
   html {
     min-height: 100vh;
     min-height: -webkit-fill-available;
   }

   body {
     min-height: 100vh;
     min-height: calc(100vh + env(safe-area-inset-bottom));
   }
   ```

4. **PWA cache limit is 50MB on iOS Safari**
   - **Impact**: Significantly lower than Chrome Android (multiple GB)
   - **Solution**: Aggressive cache management, prioritize critical assets
   ```typescript
   // Service worker cache size management
   const CACHE_SIZE_LIMIT = 40 * 1024 * 1024; // 40MB (leave buffer)

   async function manageCacheSize() {
     const cacheNames = await caches.keys();
     let totalSize = 0;

     for (const cacheName of cacheNames) {
       const cache = await caches.open(cacheName);
       const requests = await cache.keys();

       for (const request of requests) {
         const response = await cache.match(request);
         if (response) {
           const blob = await response.blob();
           totalSize += blob.size;
         }
       }
     }

     if (totalSize > CACHE_SIZE_LIMIT) {
       // Delete oldest cached items
       // Implementation depends on your caching strategy
     }
   }
   ```

5. **iOS Safari requires user gesture for many APIs**
   - **Affected APIs**:
     - Audio/Video playback
     - Fullscreen
     - Device orientation/motion (iOS 13+)
     - Clipboard write (iOS 13.4+)
   - **Solution**: Always initiate from user interaction (click, tap)

6. **Service Worker limitations**
   - ⚠️ iOS Safari terminates service workers aggressively
   - ⚠️ Background sync not supported
   - ⚠️ Push notifications only work if PWA is installed
   - **Solution**: Implement fallbacks for unsupported features

### iOS 17 and iOS 18 Improvements

**iOS 17 Enhancements:**
- ✅ Full PWA installation support
- ✅ Better cache management and offline capabilities
- ✅ Improved WebKit engine performance
- ✅ Enhanced push notification support
- ✅ "Add to Home Screen" from Safari View Controller
- ✅ Better background process support

**iOS 18 / Safari 18 (Released 2024):**
- ✅ 48 new web platform features
- ✅ Better standards compliance
- ✅ Performance improvements

**Safari 26 Beta (2025 - WWDC 2025):**
- ✅ **Default Web App behavior**: By default, every website added to Home Screen opens as web app
- ✅ **SVG icon support**: Favicons and interface icons now support SVG
- ✅ **Anchor positioning**: New layout mechanism for positioned elements
- ✅ **Improved popover support**: Better integration with anchor positioning
- ⚠️ User can disable "Open as Web App" to get bookmark behavior instead

**Limitations Still Present:**
- ⚠️ Only Safari fully supports PWAs on iOS
- ⚠️ Chrome/Firefox on iOS use WebKit and lack essential PWA features
- ⚠️ 50MB cache storage limit persists
- ⚠️ Background sync not available
- ⚠️ Limited push notification support compared to Android

---

## Touch and Gesture APIs

### Pointer Events API (Recommended)

**Why Pointer Events over Touch Events:**
- ✅ Unified API for mouse, touch, pen, and other pointer devices
- ✅ Supported in all modern browsers (Pointer Events Level 2)
- ✅ Simpler than managing separate mouse/touch event handlers
- ✅ Better multi-touch support with `pointerId` tracking
- ✅ Automatic pointer capture

**Browser Support (2025):**
- ✅ Chrome/Edge: Full support (Level 2)
- ✅ Firefox: Full support (Level 2)
- ✅ Safari: Full support (Safari 13+)
- 📈 Pointer Events Level 3: In development

**Basic Implementation:**
```typescript
// src/lib/utils/pointer-events.ts

export interface PointerState {
  id: number;
  type: string;
  x: number;
  y: number;
  pressure: number;
  isPrimary: boolean;
}

export class PointerManager {
  private activePointers = new Map<number, PointerState>();
  private element: HTMLElement | null = null;

  attach(element: HTMLElement) {
    this.element = element;

    element.addEventListener('pointerdown', this.handlePointerDown);
    element.addEventListener('pointermove', this.handlePointerMove);
    element.addEventListener('pointerup', this.handlePointerUp);
    element.addEventListener('pointercancel', this.handlePointerCancel);
  }

  detach() {
    if (!this.element) return;

    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
    this.element.removeEventListener('pointercancel', this.handlePointerCancel);

    this.element = null;
    this.activePointers.clear();
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.activePointers.set(e.pointerId, {
      id: e.pointerId,
      type: e.pointerType,
      x: e.clientX,
      y: e.clientY,
      pressure: e.pressure,
      isPrimary: e.isPrimary
    });

    // Capture pointer for consistent tracking
    (e.target as HTMLElement)?.setPointerCapture(e.pointerId);
  };

  private handlePointerMove = (e: PointerEvent) => {
    const pointer = this.activePointers.get(e.pointerId);
    if (!pointer) return;

    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.pressure = e.pressure;
  };

  private handlePointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    (e.target as HTMLElement)?.releasePointerCapture(e.pointerId);
  };

  private handlePointerCancel = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
  };

  getActivePointers(): PointerState[] {
    return Array.from(this.activePointers.values());
  }

  getPointerCount(): number {
    return this.activePointers.size;
  }
}
```

### Multi-Touch Gestures

**Pinch-to-Zoom:**
```typescript
// src/lib/gestures/pinch-zoom.ts

export interface PinchState {
  initialDistance: number;
  currentDistance: number;
  scale: number;
  center: { x: number; y: number };
}

export class PinchZoomGesture {
  private pointers = new Map<number, { x: number; y: number }>();
  private initialDistance: number = 0;
  private onPinch?: (state: PinchState) => void;
  private onPinchEnd?: () => void;

  constructor(
    private element: HTMLElement,
    options?: {
      onPinch?: (state: PinchState) => void;
      onPinchEnd?: () => void;
    }
  ) {
    this.onPinch = options?.onPinch;
    this.onPinchEnd = options?.onPinchEnd;
    this.attach();
  }

  private attach() {
    this.element.addEventListener('pointerdown', this.handlePointerDown);
    this.element.addEventListener('pointermove', this.handlePointerMove);
    this.element.addEventListener('pointerup', this.handlePointerUp);
    this.element.addEventListener('pointercancel', this.handlePointerUp);
  }

  detach() {
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
    this.element.removeEventListener('pointercancel', this.handlePointerUp);
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2) {
      this.initialDistance = this.getDistance();
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;

    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2) {
      const currentDistance = this.getDistance();
      const scale = currentDistance / this.initialDistance;
      const center = this.getCenter();

      this.onPinch?.({
        initialDistance: this.initialDistance,
        currentDistance,
        scale,
        center
      });
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);

    if (this.pointers.size < 2) {
      this.initialDistance = 0;
      this.onPinchEnd?.();
    }
  };

  private getDistance(): number {
    const points = Array.from(this.pointers.values());
    if (points.length !== 2) return 0;

    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getCenter(): { x: number; y: number } {
    const points = Array.from(this.pointers.values());
    if (points.length !== 2) return { x: 0, y: 0 };

    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
  }
}
```

**Swipe Gesture:**
```typescript
// src/lib/gestures/swipe.ts

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeConfig {
  minDistance?: number;
  maxTime?: number;
  onSwipe?: (direction: SwipeDirection) => void;
}

export class SwipeGesture {
  private startX: number = 0;
  private startY: number = 0;
  private startTime: number = 0;
  private readonly minDistance: number;
  private readonly maxTime: number;
  private readonly onSwipe?: (direction: SwipeDirection) => void;

  constructor(
    private element: HTMLElement,
    config: SwipeConfig = {}
  ) {
    this.minDistance = config.minDistance ?? 50;
    this.maxTime = config.maxTime ?? 300;
    this.onSwipe = config.onSwipe;
    this.attach();
  }

  private attach() {
    this.element.addEventListener('pointerdown', this.handlePointerDown);
    this.element.addEventListener('pointerup', this.handlePointerUp);
  }

  detach() {
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startTime = Date.now();
  };

  private handlePointerUp = (e: PointerEvent) => {
    const deltaX = e.clientX - this.startX;
    const deltaY = e.clientY - this.startY;
    const deltaTime = Date.now() - this.startTime;

    if (deltaTime > this.maxTime) return;

    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (absDeltaX < this.minDistance && absDeltaY < this.minDistance) return;

    let direction: SwipeDirection;
    if (absDeltaX > absDeltaY) {
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      direction = deltaY > 0 ? 'down' : 'up';
    }

    this.onSwipe?.(direction);
  };
}
```

**Long Press Gesture:**
```typescript
// src/lib/gestures/long-press.ts

export interface LongPressConfig {
  duration?: number;
  onLongPress?: (x: number, y: number) => void;
  onLongPressCancel?: () => void;
}

export class LongPressGesture {
  private timer: number | null = null;
  private startX: number = 0;
  private startY: number = 0;
  private readonly duration: number;
  private readonly onLongPress?: (x: number, y: number) => void;
  private readonly onLongPressCancel?: () => void;

  constructor(
    private element: HTMLElement,
    config: LongPressConfig = {}
  ) {
    this.duration = config.duration ?? 500;
    this.onLongPress = config.onLongPress;
    this.onLongPressCancel = config.onLongPressCancel;
    this.attach();
  }

  private attach() {
    this.element.addEventListener('pointerdown', this.handlePointerDown);
    this.element.addEventListener('pointermove', this.handlePointerMove);
    this.element.addEventListener('pointerup', this.handlePointerUp);
    this.element.addEventListener('pointercancel', this.handlePointerCancel);
  }

  detach() {
    this.cancelTimer();
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
    this.element.removeEventListener('pointercancel', this.handlePointerCancel);
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.startX = e.clientX;
    this.startY = e.clientY;

    this.timer = window.setTimeout(() => {
      this.onLongPress?.(this.startX, this.startY);
      this.timer = null;
    }, this.duration);
  };

  private handlePointerMove = (e: PointerEvent) => {
    const deltaX = Math.abs(e.clientX - this.startX);
    const deltaY = Math.abs(e.clientY - this.startY);

    // Cancel if pointer moves too much (>10px)
    if (deltaX > 10 || deltaY > 10) {
      this.cancelTimer();
    }
  };

  private handlePointerUp = () => {
    this.cancelTimer();
  };

  private handlePointerCancel = () => {
    this.cancelTimer();
  };

  private cancelTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      this.onLongPressCancel?.();
    }
  }
}
```

### CSS touch-action and Passive Listeners

**CSS `touch-action` Property:**
```css
/* Disable all touch gestures */
.no-touch {
  touch-action: none;
}

/* Allow only horizontal panning */
.horizontal-scroll {
  touch-action: pan-x;
}

/* Allow only vertical panning */
.vertical-scroll {
  touch-action: pan-y;
}

/* Allow pinch-zoom but not panning */
.zoom-only {
  touch-action: pinch-zoom;
}

/* Allow default touch behavior */
.default-touch {
  touch-action: auto;
}

/* Prevent double-tap zoom (iOS Safari) */
button, a, .interactive {
  touch-action: manipulation;
}
```

**Passive Event Listeners for Performance:**
```typescript
// Passive listeners improve scroll performance
element.addEventListener('touchstart', handler, { passive: true });
element.addEventListener('touchmove', handler, { passive: true });

// If you need to call preventDefault(), you CANNOT use passive
element.addEventListener('touchstart', (e) => {
  e.preventDefault(); // Only works with passive: false
  // ... handler logic
}, { passive: false });

// Modern pointer events with passive option
element.addEventListener('pointerdown', handler, { passive: true });
element.addEventListener('pointermove', handler, { passive: true });
```

---

## Mobile Input Optimization

### inputmode Attribute

**Purpose:** Tell mobile keyboards which layout to show

**Available Values:**
```html
<!-- Default text keyboard -->
<input type="text" inputmode="text" />

<!-- No keyboard (custom input UI) -->
<input type="text" inputmode="none" />

<!-- Numeric keyboard with decimal -->
<input type="text" inputmode="decimal" />

<!-- Email keyboard with @ symbol -->
<input type="email" inputmode="email" />

<!-- URL keyboard with .com and / -->
<input type="url" inputmode="url" />

<!-- Phone number keyboard -->
<input type="tel" inputmode="tel" />

<!-- Numeric keyboard (0-9 only) -->
<input type="text" inputmode="numeric" />

<!-- Search keyboard with search button -->
<input type="search" inputmode="search" />
```

**Best Practice Combinations:**
```html
<!-- Phone number input -->
<input type="tel" inputmode="tel" autocomplete="tel" />

<!-- Credit card number -->
<input type="text" inputmode="numeric" autocomplete="cc-number" />

<!-- Email address -->
<input type="email" inputmode="email" autocomplete="email" />

<!-- Price/amount input -->
<input type="text" inputmode="decimal" pattern="[0-9]*\.?[0-9]*" />

<!-- Search field -->
<input type="search" inputmode="search" />
```

### autocomplete Attribute

**Over 50 standardized values!** Here are the most useful:

```html
<!-- Personal Information -->
<input autocomplete="name" />
<input autocomplete="given-name" />
<input autocomplete="family-name" />
<input autocomplete="email" />
<input autocomplete="tel" />
<input autocomplete="tel-national" />
<input autocomplete="tel-country-code" />

<!-- Address -->
<input autocomplete="street-address" />
<input autocomplete="address-line1" />
<input autocomplete="address-line2" />
<input autocomplete="address-level1" /> <!-- State/Province -->
<input autocomplete="address-level2" /> <!-- City -->
<input autocomplete="postal-code" />
<input autocomplete="country" />
<input autocomplete="country-name" />

<!-- Payment -->
<input autocomplete="cc-name" />
<input autocomplete="cc-number" />
<input autocomplete="cc-exp" />
<input autocomplete="cc-exp-month" />
<input autocomplete="cc-exp-year" />
<input autocomplete="cc-csc" />

<!-- Authentication -->
<input autocomplete="username" />
<input autocomplete="current-password" />
<input autocomplete="new-password" />
<input autocomplete="one-time-code" /> <!-- ⭐ SMS verification codes -->

<!-- Organization -->
<input autocomplete="organization" />
<input autocomplete="organization-title" />

<!-- Other -->
<input autocomplete="bday" />
<input autocomplete="url" />
```

**One-Time Code (OTP) Auto-Suggestion:**
```html
<!-- iOS and Android will automatically detect SMS codes -->
<input
  type="text"
  inputmode="numeric"
  autocomplete="one-time-code"
  pattern="[0-9]{6}"
  maxlength="6"
  placeholder="123456"
/>
```

### enterkeyhint Attribute

**Purpose:** Customize the enter key label on virtual keyboards

```html
<!-- Show "Enter" label -->
<input enterkeyhint="enter" />

<!-- Show "Done" label -->
<input enterkeyhint="done" />

<!-- Show "Go" label -->
<input enterkeyhint="go" />

<!-- Show "Next" label -->
<input enterkeyhint="next" />

<!-- Show "Previous" label -->
<input enterkeyhint="previous" />

<!-- Show "Search" label -->
<input type="search" enterkeyhint="search" />

<!-- Show "Send" label -->
<textarea enterkeyhint="send"></textarea>
```

**Usage Example:**
```svelte
<!-- Multi-step form with "Next" button behavior -->
<form>
  <input
    type="text"
    autocomplete="given-name"
    enterkeyhint="next"
    on:keydown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('last-name')?.focus();
      }
    }}
  />

  <input
    id="last-name"
    type="text"
    autocomplete="family-name"
    enterkeyhint="next"
    on:keydown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('email')?.focus();
      }
    }}
  />

  <input
    id="email"
    type="email"
    autocomplete="email"
    enterkeyhint="done"
    on:keydown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        form.submit();
      }
    }}
  />
</form>
```

### Virtual Keyboard API

**Purpose:** Control virtual keyboard visibility and behavior

**Browser Support:**
- ✅ Chrome Android 94+
- ❌ iOS Safari: Not supported

```typescript
// src/lib/utils/virtual-keyboard.ts

export class VirtualKeyboardManager {
  isSupported(): boolean {
    return 'virtualKeyboard' in navigator;
  }

  show() {
    if (this.isSupported()) {
      (navigator as any).virtualKeyboard.show();
    }
  }

  hide() {
    if (this.isSupported()) {
      (navigator as any).virtualKeyboard.hide();
    }
  }

  // Control whether keyboard overlays content or resizes viewport
  setOverlaysContent(overlays: boolean) {
    if (this.isSupported()) {
      (navigator as any).virtualKeyboard.overlaysContent = overlays;
    }
  }

  getGeometry(): DOMRect | null {
    if (!this.isSupported()) return null;
    return (navigator as any).virtualKeyboard.boundingRect;
  }

  onGeometryChange(callback: (geometry: DOMRect) => void) {
    if (!this.isSupported()) return;

    (navigator as any).virtualKeyboard.addEventListener('geometrychange', () => {
      const geometry = this.getGeometry();
      if (geometry) callback(geometry);
    });
  }
}

export const virtualKeyboard = new VirtualKeyboardManager();
```

**Usage Example:**
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { virtualKeyboard } from '$lib/utils/virtual-keyboard';

  let keyboardHeight = $state(0);

  onMount(() => {
    if (virtualKeyboard.isSupported()) {
      // Allow keyboard to overlay content instead of resizing viewport
      virtualKeyboard.setOverlaysContent(true);

      // Listen for keyboard geometry changes
      virtualKeyboard.onGeometryChange((geometry) => {
        keyboardHeight = geometry.height;
        console.log('Keyboard height:', keyboardHeight);
      });
    }
  });
</script>

<div class="content" style:padding-bottom={keyboardHeight + 'px'}>
  <!-- Content that needs to stay above keyboard -->
</div>
```

### Complete Mobile Form Example

```svelte
<!-- src/lib/components/forms/MobileOptimizedForm.svelte -->
<script lang="ts">
  import { haptics } from '$lib/utils/haptics';

  let form = $state({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    amount: ''
  });

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    haptics.success();
    console.log('Form submitted:', form);
  }

  function focusNext(currentId: string, nextId: string) {
    return (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        haptics.tap();
        document.getElementById(nextId)?.focus();
      }
    };
  }
</script>

<form on:submit={handleSubmit} class="mobile-form">
  <div class="form-group">
    <label for="first-name">First Name</label>
    <input
      id="first-name"
      type="text"
      bind:value={form.firstName}
      autocomplete="given-name"
      inputmode="text"
      enterkeyhint="next"
      on:keydown={focusNext('first-name', 'last-name')}
      required
    />
  </div>

  <div class="form-group">
    <label for="last-name">Last Name</label>
    <input
      id="last-name"
      type="text"
      bind:value={form.lastName}
      autocomplete="family-name"
      inputmode="text"
      enterkeyhint="next"
      on:keydown={focusNext('last-name', 'email')}
      required
    />
  </div>

  <div class="form-group">
    <label for="email">Email</label>
    <input
      id="email"
      type="email"
      bind:value={form.email}
      autocomplete="email"
      inputmode="email"
      enterkeyhint="next"
      on:keydown={focusNext('email', 'phone')}
      required
    />
  </div>

  <div class="form-group">
    <label for="phone">Phone Number</label>
    <input
      id="phone"
      type="tel"
      bind:value={form.phone}
      autocomplete="tel"
      inputmode="tel"
      enterkeyhint="next"
      on:keydown={focusNext('phone', 'amount')}
    />
  </div>

  <div class="form-group">
    <label for="amount">Amount</label>
    <input
      id="amount"
      type="text"
      bind:value={form.amount}
      inputmode="decimal"
      pattern="[0-9]*\.?[0-9]*"
      placeholder="0.00"
      enterkeyhint="done"
    />
  </div>

  <button type="submit" class="submit-button">
    Submit
  </button>
</form>

<style>
  .mobile-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-weight: 600;
    font-size: 0.875rem;
  }

  input {
    padding: 0.75rem;
    font-size: 16px; /* Prevents iOS zoom on focus */
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    /* Prevent double-tap zoom */
    touch-action: manipulation;
  }

  input:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px var(--primary-color-alpha);
  }

  .submit-button {
    padding: 1rem;
    font-size: 1rem;
    font-weight: 600;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: 0.5rem;
    touch-action: manipulation;
    cursor: pointer;
  }

  .submit-button:active {
    transform: scale(0.98);
  }
</style>
```

---

## Pull-to-Refresh Implementation

### Using CSS overscroll-behavior

**The Modern Approach (2025):**

```css
/* global.css */

/* Disable native pull-to-refresh on body */
html {
  overscroll-behavior: none;
}

/* Allow vertical overscroll within scrollable containers */
body {
  overscroll-behavior-y: contain;
}

/* For specific scrollable areas, allow default behavior */
.scrollable-content {
  overscroll-behavior-y: auto;
}
```

**Browser Support:**
- ✅ Chrome/Edge: Full support
- ✅ Firefox: Full support
- ✅ Safari iOS: Full support (recent versions)

### Custom Pull-to-Refresh Component

```svelte
<!-- src/lib/components/PullToRefresh.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { haptics } from '$lib/utils/haptics';

  interface Props {
    onRefresh: () => Promise<void>;
    threshold?: number;
    children: import('svelte').Snippet;
  }

  let {
    onRefresh,
    threshold = 80,
    children
  }: Props = $props();

  let container: HTMLDivElement;
  let pullDistance = $state(0);
  let isRefreshing = $state(false);
  let isPulling = $state(false);

  let startY = 0;
  let currentY = 0;

  const MAX_PULL = 120;
  const REFRESH_THRESHOLD = threshold;

  onMount(() => {
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
  });

  function handleTouchStart(e: TouchEvent) {
    if (container.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    isPulling = true;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isPulling || isRefreshing) return;
    if (container.scrollTop > 0) {
      isPulling = false;
      return;
    }

    currentY = e.touches[0].clientY;
    const delta = currentY - startY;

    if (delta > 0) {
      e.preventDefault(); // Prevent native pull-to-refresh

      // Apply resistance to pull distance
      pullDistance = Math.min(delta * 0.5, MAX_PULL);

      // Haptic feedback at threshold
      if (pullDistance >= REFRESH_THRESHOLD && pullDistance - 1 < REFRESH_THRESHOLD) {
        haptics.tap();
      }
    }
  }

  async function handleTouchEnd() {
    if (!isPulling) return;
    isPulling = false;

    if (pullDistance >= REFRESH_THRESHOLD) {
      isRefreshing = true;
      haptics.click();

      try {
        await onRefresh();
        haptics.success();
      } catch (error) {
        console.error('Refresh failed:', error);
        haptics.error();
      } finally {
        isRefreshing = false;
        pullDistance = 0;
      }
    } else {
      pullDistance = 0;
    }
  }

  $effect(() => {
    if (!isPulling && !isRefreshing) {
      pullDistance = 0;
    }
  });
</script>

<div class="pull-to-refresh-wrapper">
  <div
    class="refresh-indicator"
    class:active={pullDistance > 0}
    class:refreshing={isRefreshing}
    style:transform="translateY({Math.min(pullDistance, 60)}px)"
  >
    {#if isRefreshing}
      <div class="spinner"></div>
    {:else if pullDistance >= REFRESH_THRESHOLD}
      <div class="icon release">↻</div>
    {:else if pullDistance > 0}
      <div class="icon pull" style:opacity={pullDistance / REFRESH_THRESHOLD}>↓</div>
    {/if}
  </div>

  <div
    bind:this={container}
    class="refresh-content"
    style:transform="translateY({pullDistance}px)"
    style:transition={isPulling ? 'none' : 'transform 0.3s ease-out'}
  >
    {@render children()}
  </div>
</div>

<style>
  .pull-to-refresh-wrapper {
    position: relative;
    height: 100%;
    overflow: hidden;
  }

  .refresh-indicator {
    position: absolute;
    top: -60px;
    left: 50%;
    transform: translateX(-50%);
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    transition: transform 0.3s ease-out;
  }

  .refresh-indicator.active {
    top: 10px;
  }

  .icon {
    font-size: 24px;
    transition: transform 0.3s;
  }

  .icon.release {
    transform: rotate(180deg);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .refresh-content {
    height: 100%;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }

  /* Disable pull-to-refresh on this component */
  .pull-to-refresh-wrapper {
    overscroll-behavior-y: none;
  }
</style>
```

**Usage:**
```svelte
<script lang="ts">
  import PullToRefresh from '$lib/components/PullToRefresh.svelte';

  let tasks = $state([]);

  async function refreshTasks() {
    console.log('Refreshing tasks...');
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call
    tasks = await fetchTasks();
  }
</script>

<PullToRefresh onRefresh={refreshTasks}>
  {#snippet children()}
    <div class="task-list">
      {#each tasks as task}
        <div class="task-item">{task.title}</div>
      {/each}
    </div>
  {/snippet}
</PullToRefresh>
```

---

## Security Best Practices

### HTTPS Requirements

**Absolute Requirements:**
- ✅ PWAs **MUST** be served over HTTPS (except localhost for development)
- ✅ Service Workers **REQUIRE** HTTPS to register
- ✅ Many APIs require secure context (HTTPS):
  - Geolocation API
  - Camera/Microphone access
  - Notifications API
  - Clipboard API
  - Web Authentication API
  - Background Sync
  - Payment Request API

**Development Exception:**
- ✅ `localhost` and `127.0.0.1` are considered secure contexts
- ✅ `http://localhost:3000` works for development

### Content Security Policy (CSP)

**Purpose:** Protect against XSS and data injection attacks

**Recommended CSP for PWA:**
```html
<!-- src/app.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' data:;
  connect-src 'self' https://api.buildos.app https://*.supabase.co;
  worker-src 'self' blob:;
  manifest-src 'self';
  form-action 'self';
  frame-ancestors 'none';
  base-uri 'self';
  upgrade-insecure-requests;
">
```

**SvelteKit Hooks Configuration:**
```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Set comprehensive security headers
  response.headers.set(
    'Content-Security-Policy',
    `
      default-src 'self';
      script-src 'self' 'wasm-unsafe-eval';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      font-src 'self' data:;
      connect-src 'self' https://api.buildos.app https://*.supabase.co;
      worker-src 'self' blob:;
      manifest-src 'self';
      form-action 'self';
      frame-ancestors 'none';
      base-uri 'self';
      upgrade-insecure-requests;
    `.replace(/\s+/g, ' ').trim()
  );

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=()'
  );

  return response;
};
```

### Authentication Best Practices

**Passkey Support (Web Authentication API):**
```typescript
// src/lib/auth/webauthn.ts

export class WebAuthnManager {
  async isSupported(): Promise<boolean> {
    return !!(window.PublicKeyCredential);
  }

  async register(username: string): Promise<Credential | null> {
    if (!(await this.isSupported())) {
      throw new Error('WebAuthn not supported');
    }

    const challenge = await this.getRegistrationChallenge(username);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: this.base64ToArrayBuffer(challenge.challenge),
        rp: {
          name: 'BuildOS',
          id: window.location.hostname
        },
        user: {
          id: this.base64ToArrayBuffer(challenge.userId),
          name: username,
          displayName: username
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },  // ES256
          { alg: -257, type: 'public-key' } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Prefer platform authenticators
          userVerification: 'required',
          residentKey: 'required'
        },
        timeout: 60000,
        attestation: 'none'
      }
    });

    if (credential) {
      await this.verifyRegistration(credential);
    }

    return credential;
  }

  async authenticate(): Promise<Credential | null> {
    if (!(await this.isSupported())) {
      throw new Error('WebAuthn not supported');
    }

    const challenge = await this.getAuthenticationChallenge();

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: this.base64ToArrayBuffer(challenge.challenge),
        timeout: 60000,
        userVerification: 'required'
      }
    });

    if (credential) {
      await this.verifyAuthentication(credential);
    }

    return credential;
  }

  private async getRegistrationChallenge(username: string) {
    const response = await fetch('/api/auth/webauthn/register/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    return await response.json();
  }

  private async getAuthenticationChallenge() {
    const response = await fetch('/api/auth/webauthn/authenticate/challenge');
    return await response.json();
  }

  private async verifyRegistration(credential: Credential) {
    const response = await fetch('/api/auth/webauthn/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential })
    });
    return await response.json();
  }

  private async verifyAuthentication(credential: Credential) {
    const response = await fetch('/api/auth/webauthn/authenticate/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential })
    });
    return await response.json();
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export const webauthn = new WebAuthnManager();
```

### Input Sanitization

**Always sanitize user input to prevent XSS:**

```typescript
// src/lib/utils/sanitize.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'title']
  });
}

export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid protocol');
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

**Usage:**
```svelte
<script lang="ts">
  import { sanitizeHtml } from '$lib/utils/sanitize';

  let userContent = $state('');
  let sanitized = $derived(sanitizeHtml(userContent));
</script>

<!-- Safe: Sanitized before rendering -->
<div>{@html sanitized}</div>

<!-- Unsafe: Never do this -->
<!-- <div>{@html userContent}</div> -->
```

### Secure Storage

**Storage Hierarchy (by security level):**

1. **Server-side session** (most secure)
2. **HttpOnly cookies** (secure, not accessible to JS)
3. **IndexedDB** (client-side, encrypted at rest by OS)
4. **localStorage** (client-side, plaintext, avoid for sensitive data)
5. **sessionStorage** (same as localStorage but cleared on tab close)

**Never store sensitive data in:**
- ❌ localStorage/sessionStorage
- ❌ Cookies without HttpOnly flag
- ❌ URL parameters or fragments
- ❌ Service worker cache (unencrypted)

**Token Storage Best Practice:**
```typescript
// src/lib/auth/token-manager.ts

export class SecureTokenManager {
  // Store access token in memory only (lost on refresh, but secure)
  private accessToken: string | null = null;

  // Refresh token should be HttpOnly cookie set by server
  // Never accessible to JavaScript

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  clearAccessToken() {
    this.accessToken = null;
  }

  async refreshAccessToken(): Promise<string | null> {
    try {
      // Refresh token sent automatically via HttpOnly cookie
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include' // Important: Include cookies
      });

      if (!response.ok) throw new Error('Refresh failed');

      const { accessToken } = await response.json();
      this.setAccessToken(accessToken);
      return accessToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.clearAccessToken();
      return null;
    }
  }
}

export const tokenManager = new SecureTokenManager();
```

---

## Implementation Checklists

### PWA Setup Checklist

- [ ] Install and configure `@vite-pwa/sveltekit`
- [ ] Create comprehensive manifest.json with:
  - [ ] App name, short_name, description
  - [ ] Icons (192x192, 512x512, maskable versions)
  - [ ] theme_color and background_color
  - [ ] display: 'standalone'
  - [ ] shortcuts (optional)
  - [ ] share_target (optional, Android only)
- [ ] Implement custom install prompt
- [ ] Configure service worker with Workbox
- [ ] Set up offline fallback page
- [ ] Test installation on iOS Safari and Chrome Android
- [ ] Verify manifest in Chrome DevTools (Application tab)
- [ ] Test app functionality while offline

### Mobile Optimization Checklist

**Touch and Gestures:**
- [ ] Use Pointer Events API (not Touch Events)
- [ ] Implement haptic feedback for key interactions
- [ ] Add `touch-action: manipulation` to prevent double-tap zoom
- [ ] Use passive event listeners where possible
- [ ] Test multi-touch gestures (pinch, swipe, long-press)

**Input Optimization:**
- [ ] Add appropriate `inputmode` to all inputs
- [ ] Add comprehensive `autocomplete` attributes
- [ ] Use `enterkeyhint` for better keyboard UX
- [ ] Set input `font-size: 16px` to prevent iOS zoom
- [ ] Implement focus management for multi-step forms

**iOS Safari Specific:**
- [ ] Add viewport-fit=cover meta tag
- [ ] Use env(safe-area-inset-*) for safe areas
- [ ] Add apple-mobile-web-app-* meta tags
- [ ] Test in standalone mode (PWA installed)
- [ ] Verify 50MB cache limit handling
- [ ] Test fixed positioning with safe areas

**Performance:**
- [ ] Implement pull-to-refresh (custom or disable native)
- [ ] Use CSS overscroll-behavior
- [ ] Optimize images for mobile (WebP, responsive)
- [ ] Lazy load below-the-fold content
- [ ] Minimize main thread work
- [ ] Test on real devices (iOS and Android)

### Offline-First Checklist

- [ ] Implement service worker with appropriate caching strategies
- [ ] Use IndexedDB (not localStorage) for offline data
- [ ] Implement Background Sync for failed requests
- [ ] Create offline fallback UI
- [ ] Show network status indicator
- [ ] Queue actions when offline, sync when online
- [ ] Handle quota exceeded errors gracefully
- [ ] Test app functionality completely offline
- [ ] Verify data sync after going back online

### Security Checklist

- [ ] Serve over HTTPS (always, except localhost)
- [ ] Implement comprehensive CSP headers
- [ ] Set security headers (X-Frame-Options, etc.)
- [ ] Sanitize all user-generated content
- [ ] Use HttpOnly cookies for refresh tokens
- [ ] Never store sensitive data in localStorage
- [ ] Implement CSRF protection
- [ ] Use Permissions Policy to limit API access
- [ ] Implement rate limiting on API endpoints
- [ ] Regular security audits and dependency updates

### Notification Checklist

- [ ] Request notification permission appropriately
- [ ] Implement notification service in service worker
- [ ] Show rich notifications with actions
- [ ] Handle notification click events
- [ ] Implement badging API for unread counts
- [ ] Test notifications on iOS (PWA installed) and Android
- [ ] Provide settings to disable notifications
- [ ] Respect user's notification preferences

---

## Resources and References

### Official Documentation

**PWA:**
- [MDN: Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [web.dev: Learn PWA](https://web.dev/learn/pwa/)
- [Chrome Developers: PWA](https://developer.chrome.com/docs/capabilities/)

**SvelteKit:**
- [@vite-pwa/sveltekit](https://vite-pwa-org.netlify.app/frameworks/sveltekit)
- [Vite PWA](https://vite-pwa-org.netlify.app/)

**Service Workers:**
- [Workbox Documentation](https://developer.chrome.com/docs/workbox/)
- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

**Mobile APIs:**
- [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API)
- [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API)
- [Contact Picker API](https://developer.mozilla.org/en-US/docs/Web/API/Contact_Picker_API)

**iOS Safari:**
- [WebKit Blog](https://webkit.org/blog/)
- [Safari Release Notes](https://developer.apple.com/documentation/safari-release-notes)
- [Designing for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)

**Chrome Android:**
- [Chrome Developers Blog](https://developer.chrome.com/blog/)
- [What's New in Web on Android](https://developer.chrome.com/blog/whats-new-in-web-on-android-io2023)

### Tools and Libraries

**PWA Tools:**
- `@vite-pwa/sveltekit` - Zero-config PWA plugin for SvelteKit
- `workbox-precaching` - Precaching service worker library
- `workbox-routing` - Service worker routing
- `workbox-strategies` - Caching strategies

**Database:**
- `idb` - Promise-based IndexedDB wrapper
- `dexie` - Advanced IndexedDB wrapper (alternative)

**Utilities:**
- `isomorphic-dompurify` - XSS sanitization
- `ua-parser-js` - User agent detection

### Testing Tools

**PWA Testing:**
- Chrome DevTools: Application > Manifest / Service Workers / Storage
- Lighthouse: PWA audit
- [PWA Builder](https://www.pwabuilder.com/) - PWA validation and packaging

**Mobile Testing:**
- Chrome Remote Debugging (Android)
- Safari Web Inspector (iOS)
- BrowserStack / Sauce Labs (cloud testing)
- Real device testing (essential!)

### Community Resources

**Articles:**
- [Building PWAs with SvelteKit](https://dev.to/braide/building-progressive-web-applications-using-sveltekit-58gj)
- [Offline-first PWA with SvelteKit](https://www.sarcevic.dev/offline-first-installable-pwa-sveltekit-workbox-precaching)
- [Take Control of Your Scroll](https://developer.chrome.com/blog/overscroll-behavior)
- [Better Form Inputs for Mobile](https://css-tricks.com/better-form-inputs-for-better-mobile-user-experiences/)

**GitHub Repositories:**
- [vite-pwa/sveltekit](https://github.com/vite-pwa/sveltekit)
- [GoogleChrome/workbox](https://github.com/GoogleChrome/workbox)

---

## Next Steps for BuildOS

### Immediate Actions

1. **Install @vite-pwa/sveltekit**
   ```bash
   pnpm add -D @vite-pwa/sveltekit
   ```

2. **Configure PWA in svelte.config.js**
   - Add manifest with BuildOS branding
   - Configure Workbox caching strategies
   - Set up offline fallback

3. **Implement Haptic Feedback**
   - Create haptics utility
   - Add to button clicks, task completions, swipe actions
   - Provide user settings to disable

4. **Optimize Mobile Forms**
   - Add `inputmode` to all form inputs
   - Add comprehensive `autocomplete` attributes
   - Implement `enterkeyhint` for better keyboard navigation

5. **iOS Safe Area Support**
   - Add viewport-fit=cover meta tag
   - Update CSS with env(safe-area-inset-*)
   - Test on real iOS devices

### Short-term Enhancements

6. **Pull-to-Refresh**
   - Implement custom pull-to-refresh component
   - Add to task list, brain dump list, notifications

7. **Offline Support**
   - Implement IndexedDB for tasks, brain dumps
   - Add Background Sync for failed API requests
   - Show offline indicator

8. **Web Share Integration**
   - Add share buttons for tasks, projects
   - Implement Web Share Target to receive shared content

9. **Notification System**
   - Request notification permission
   - Implement task reminders
   - Add badging for unread counts

### Long-term Goals

10. **Advanced Gestures**
    - Swipe to complete tasks
    - Long-press for context menus
    - Pinch-to-zoom on visualizations

11. **Contact Picker Integration**
    - Quick contact selection for task assignment
    - Collaboration features

12. **Biometric Authentication**
    - Implement WebAuthn for passkey login
    - Add fingerprint/Face ID support

13. **Device Motion Features**
    - Shake to undo
    - Tilt-based navigation (experimental)

---

## Conclusion

PWA and mobile capabilities in 2025 are mature and powerful. Key takeaways:

1. **Use modern standards**: Pointer Events, Workbox 7, @vite-pwa/sveltekit
2. **Progressive enhancement**: Build for offline first, treat network as bonus
3. **iOS quirks are real**: Test on real iOS devices, handle safe areas, respect 50MB cache limit
4. **User experience matters**: Haptics, input optimization, pull-to-refresh all contribute to app-like feel
5. **Security is non-negotiable**: HTTPS, CSP, sanitization, secure token storage

By implementing these patterns and best practices, BuildOS can deliver a native app-like experience on mobile devices while remaining a web-first platform.

---

**Document Version:** 1.0
**Last Updated:** 2025-11-21
**Author:** Claude (Anthropic)
**Research Sources:** web.dev, MDN, Chrome Developers Blog, WebKit Blog, Stack Overflow, GitHub
