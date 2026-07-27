<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';
import { useApi } from '../composables/useApi';
import { useAuth } from '../composables/useAuth.js';

const router = useRouter();
const { currentVersion, updateAvailable, rootPath, homePath, dismissUpdate } =
  useApi();

// ── Viewport ──────────────────────────────────────────────────────────────
const viewportWidth = ref(window.innerWidth);
const viewportHeight = ref(window.innerHeight);

function onViewportResize() {
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
}

onMounted(() => {
  document.title = 'Settings · tofucode';
  window.addEventListener('resize', onViewportResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onViewportResize);
});

// ── Update ────────────────────────────────────────────────────────────────
function handleDismissUpdate() {
  if (updateAvailable.value) dismissUpdate(updateAvailable.value.latestVersion);
}

// ── PWA ───────────────────────────────────────────────────────────────────
const isUpdatingPWA = ref(false);

async function handleClearCacheAndUpdate() {
  if (isUpdatingPWA.value) return;
  const confirmed = confirm(
    'Clear cache and update PWA?\n\nThis will:\n- Unregister the service worker\n- Clear all caches\n- Reload the page with the latest version',
  );
  if (!confirmed) return;

  isUpdatingPWA.value = true;
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
    location.replace(location.href);
  } catch (error) {
    console.error('Failed to clear cache:', error);
    alert('Failed to clear cache. Please try manually clearing browser data.');
    isUpdatingPWA.value = false;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────
const { authStatus, logout } = useAuth();

async function handleLogout() {
  if (!confirm('Sign out of tofucode?')) return;
  await logout();
  router.push({ name: 'auth' });
}
</script>

<template>
  <div class="settings-view">
    <AppHeader title="Settings" subtitle="Instance info and app controls" />

    <div class="settings-body">
      <!-- About -->
      <section class="settings-section">
        <h2 class="section-heading">About</h2>

        <div class="meta-row">
          <span class="meta-key">Version</span>
          <span class="meta-value">{{ currentVersion ? `v${currentVersion}` : '—' }}</span>
        </div>

        <div v-if="updateAvailable" class="update-banner">
          <a
            class="update-link"
            :href="updateAvailable.updateUrl"
            target="_blank"
            rel="noopener"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
            <span>v{{ updateAvailable.latestVersion }} available</span>
          </a>
          <button class="dismiss-btn" title="Dismiss" @click="handleDismissUpdate">×</button>
        </div>
      </section>

      <!-- Paths -->
      <section class="settings-section">
        <h2 class="section-heading">Paths</h2>
        <p class="section-description">
          Set on the server via environment variables — read-only here.
        </p>

        <div class="meta-row">
          <span class="meta-key">Root path</span>
          <code v-if="rootPath" class="meta-value mono">{{ rootPath }}</code>
          <span v-else class="meta-value muted">unrestricted</span>
        </div>

        <div class="meta-row">
          <span class="meta-key">Home</span>
          <code class="meta-value mono">{{ homePath || '—' }}</code>
        </div>
      </section>

      <!-- App -->
      <section class="settings-section">
        <h2 class="section-heading">App</h2>
        <p class="section-description">
          Force clear the service worker cache and reload with the latest version.
        </p>
        <div class="action-row">
          <button class="action-btn" :disabled="isUpdatingPWA" @click="handleClearCacheAndUpdate">
            <svg v-if="!isUpdatingPWA" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M3 21v-5h5"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" class="spin">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
            </svg>
            <span>{{ isUpdatingPWA ? 'Clearing…' : 'Clear cache & update' }}</span>
          </button>
          <a href="/api/sw-reset" class="sw-reset-link">hard reset page</a>
        </div>

        <div class="meta-row">
          <span class="meta-key">Viewport</span>
          <span class="meta-value mono">{{ viewportWidth }} × {{ viewportHeight }}</span>
        </div>
      </section>

      <!-- Auth -->
      <section class="settings-section">
        <h2 class="section-heading">Auth</h2>

        <div v-if="authStatus.authDisabled" class="auth-notice">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Auth is disabled on this instance (BYPASS_TOKEN or AUTH_DISABLED env var set).
        </div>

        <template v-else>
          <div class="meta-row">
            <span class="meta-key">Status</span>
            <span class="meta-value">Signed in</span>
          </div>
          <div class="action-row">
            <button class="action-btn danger" @click="handleLogout">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>Sign out</span>
            </button>
          </div>
          <p class="hint">
            To reset the password, delete <code>.auth.json</code> on the server and refresh.
          </p>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
}

.settings-section {
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
}

.settings-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.section-heading {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.section-description {
  margin: -6px 0 12px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 50%, transparent);
}

.meta-row:last-child {
  border-bottom: none;
}

.meta-key {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.meta-value {
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  text-align: right;
  overflow-wrap: anywhere;
}

.meta-value.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.meta-value.muted {
  color: var(--text-muted);
}

/* Update banner */
.update-banner {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
}

.update-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: var(--radius-sm);
  color: var(--success-color);
  transition: background 0.15s;
}

.update-link:hover {
  background: rgba(34, 197, 94, 0.2);
}

.dismiss-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 15px;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  transition: background 0.15s, color 0.15s;
}

.dismiss-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

/* Actions */
.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.action-btn:hover:not(:disabled) {
  background: var(--bg-tertiary);
  border-color: var(--text-muted);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.danger:hover {
  color: var(--error-color);
  border-color: color-mix(in srgb, var(--error-color) 50%, transparent);
  background: color-mix(in srgb, var(--error-color) 10%, transparent);
}

.sw-reset-link {
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s;
}

.sw-reset-link:hover {
  color: var(--text-secondary);
}

.auth-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.hint code {
  font-family: var(--font-mono);
  padding: 2px 5px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
}
</style>
