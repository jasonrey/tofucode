<script setup>
import { nextTick, onUnmounted, ref, toRaw, watch } from 'vue';
import { useAuth } from '../composables/useAuth.js';

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  settings: {
    type: Object,
    default: () => ({ debugMode: false }),
  },
  initialTab: {
    type: String,
    default: 'general',
  },
});

const emit = defineEmits(['close', 'update']);

const activeTab = ref('general');

// Local copy of settings (deep-cloned to avoid mutating shared prop references)
const localSettings = ref(structuredClone(toRaw(props.settings)));

// Flag to prevent watch loop
let isUpdatingFromProps = false;

// Watch for external changes (from server)
watch(
  () => props.settings,
  (newSettings) => {
    isUpdatingFromProps = true;
    localSettings.value = structuredClone(toRaw(newSettings));
    nextTick(() => {
      isUpdatingFromProps = false;
    });
  },
  { deep: true },
);

// Auto-save on change (only if not from external update)
watch(
  localSettings,
  (newSettings) => {
    if (!isUpdatingFromProps) {
      emit('update', newSettings);
    }
  },
  { deep: true },
);

function closeModal() {
  emit('close');
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeModal();
  }
}

watch(
  () => props.show,
  (isVisible) => {
    if (isVisible) {
      document.addEventListener('keydown', handleKeydown);
      activeTab.value = props.initialTab === 'auth' ? 'auth' : 'general';
    } else {
      document.removeEventListener('keydown', handleKeydown);
    }
  },
);

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', onViewportResize);
});

// ── Viewport dimensions ───────────────────────────────────────────────────────

const viewportWidth = ref(window.innerWidth);
const viewportHeight = ref(window.innerHeight);

function onViewportResize() {
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
}

window.addEventListener('resize', onViewportResize);

// ── Auth ──────────────────────────────────────────────────────────────────────

const { authStatus } = useAuth();

const pwCurrent = ref('');
const pwNew = ref('');
const pwConfirm = ref('');
const pwSubmitting = ref(false);
const pwError = ref(null);
const pwSuccess = ref(false);

async function handleChangePassword() {
  pwError.value = null;
  pwSuccess.value = false;

  if (!pwCurrent.value) {
    pwError.value = 'Current password is required';
    return;
  }
  if (pwNew.value.length < 8) {
    pwError.value = 'New password must be at least 8 characters';
    return;
  }
  if (pwNew.value !== pwConfirm.value) {
    pwError.value = 'Passwords do not match';
    return;
  }

  pwSubmitting.value = true;
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: pwCurrent.value,
        newPassword: pwNew.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      pwError.value = data.error || 'Failed to change password';
    } else {
      pwSuccess.value = true;
      pwCurrent.value = '';
      pwNew.value = '';
      pwConfirm.value = '';
    }
  } catch {
    pwError.value = 'Network error';
  } finally {
    pwSubmitting.value = false;
  }
}

// ── PWA ────────────────────────────────────────────────────────────────────────

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
</script>

<template>
  <div v-if="show" class="modal-overlay" @click="closeModal">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>Settings</h2>
        <div class="modal-header-actions">
          <div class="header-action-wrap">
            <button class="header-action-btn" @click="handleClearCacheAndUpdate" :disabled="isUpdatingPWA">
              <svg v-if="!isUpdatingPWA" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M3 21v-5h5"/>
              </svg>
              <svg v-else width="15" height="15" viewBox="0 0 24 24" class="spin">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
              </svg>
            </button>
            <span class="header-action-label">{{ isUpdatingPWA ? 'clearing...' : 'clear cache' }}</span>
          </div>
          <button class="close-btn" @click="closeModal" title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'general' }" @click="activeTab = 'general'">General</button>
        <button class="tab-btn" :class="{ active: activeTab === 'auth' }" @click="activeTab = 'auth'">Auth</button>
      </div>

      <div class="modal-body">

        <!-- General Tab -->
        <template v-if="activeTab === 'general'">

          <!-- Root Path -->
          <div class="setting-item">
            <div class="setting-header">
              <span class="setting-title">Root Path</span>
            </div>
            <p class="setting-description">
              Restrict file and terminal access to this directory. Leave empty for unrestricted access.
            </p>
            <input
              type="text"
              v-model="localSettings.rootPath"
              class="setting-input"
              placeholder="/home/user/projects"
            />
          </div>

          <!-- Debug Mode -->
          <div class="setting-item">
            <label class="setting-label">
              <input type="checkbox" v-model="localSettings.debugMode" class="setting-checkbox" />
              <span class="setting-title">Debug Mode</span>
            </label>
            <p class="setting-description">
              Hover over elements to see their ID and class names for development.
            </p>
          </div>

          <hr class="divider" />

          <!-- PWA & Cache -->
          <div class="setting-item">
            <div class="setting-header">
              <span class="setting-title">PWA & Cache</span>
            </div>
            <p class="setting-description">
              Force clear service worker cache and reload with the latest version.
            </p>
            <div class="action-row">
              <button class="action-btn" @click="handleClearCacheAndUpdate" :disabled="isUpdatingPWA">
                <svg v-if="!isUpdatingPWA" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/>
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                  <path d="M3 21v-5h5"/>
                </svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" class="spin">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
                </svg>
                <span>{{ isUpdatingPWA ? 'Clearing...' : 'Clear Cache & Update' }}</span>
              </button>
              <a href="/api/sw-reset" class="sw-reset-link">hard reset page</a>
            </div>
          </div>

          <!-- Viewport -->
          <div class="setting-item">
            <div class="setting-header">
              <span class="setting-title">Viewport</span>
            </div>
            <p class="setting-description">Current browser window dimensions.</p>
            <div class="viewport-display">
              <span class="viewport-value">{{ viewportWidth }} × {{ viewportHeight }}</span>
              <span class="viewport-label">px</span>
            </div>
          </div>

        </template><!-- end General Tab -->

        <!-- Auth Tab -->
        <template v-if="activeTab === 'auth'">

          <!-- Auth disabled notice -->
          <div v-if="authStatus.authDisabled" class="auth-status-notice">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Auth is disabled on this instance (BYPASS_TOKEN or AUTH_DISABLED env var set).
          </div>

          <!-- Change password form -->
          <template v-else>
            <div class="section-heading">Change Password</div>

            <div class="setting-item">
              <div class="setting-header">
                <span class="setting-title">Current Password</span>
              </div>
              <input
                type="password"
                v-model="pwCurrent"
                class="setting-input"
                placeholder="Enter current password"
                autocomplete="current-password"
              />
            </div>

            <div class="setting-item">
              <div class="setting-header">
                <span class="setting-title">New Password</span>
              </div>
              <input
                type="password"
                v-model="pwNew"
                class="setting-input"
                placeholder="At least 8 characters"
                autocomplete="new-password"
              />
            </div>

            <div class="setting-item">
              <div class="setting-header">
                <span class="setting-title">Confirm New Password</span>
              </div>
              <input
                type="password"
                v-model="pwConfirm"
                class="setting-input"
                placeholder="Repeat new password"
                autocomplete="new-password"
              />
            </div>

            <div v-if="pwError" class="form-result error">{{ pwError }}</div>
            <div v-if="pwSuccess" class="form-result success">Password changed successfully.</div>

            <button class="action-btn" @click="handleChangePassword" :disabled="pwSubmitting">
              <svg v-if="!pwSubmitting" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" class="spin">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
              </svg>
              <span>{{ pwSubmitting ? 'Saving...' : 'Change Password' }}</span>
            </button>

            <p class="auth-hint">Forgot password? Delete <code>.auth.json</code> from the server and refresh.</p>
          </template>

        </template><!-- end Auth Tab -->

      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-action-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.header-action-label {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 10;
}

.header-action-wrap:hover .header-action-label {
  opacity: 1;
}

.header-action-btn {
  padding: 4px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.header-action-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.header-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.close-btn {
  padding: 4px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  padding: 0 20px;
  gap: 2px;
  flex-shrink: 0;
}

.tab-btn {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: -1px;
  white-space: nowrap;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  color: var(--text-primary);
  border-bottom-color: var(--text-primary);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.setting-item {
  margin-bottom: 20px;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.setting-checkbox {
  appearance: none;
  width: 18px;
  height: 18px;
  cursor: pointer;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  transition: all 0.15s ease;
  position: relative;
  flex-shrink: 0;
}

.setting-checkbox:hover {
  border-color: var(--text-secondary);
}

.setting-checkbox:checked {
  background: var(--text-primary);
  border-color: var(--text-primary);
}

.setting-checkbox:checked::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  width: 4px;
  height: 8px;
  border: solid var(--bg-primary);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.setting-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.setting-description {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.setting-label + .setting-description {
  margin-left: 30px;
}

.setting-header {
  margin-bottom: 4px;
}

.section-heading {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.setting-input {
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-sm);
  outline: none;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.setting-input:hover {
  border-color: var(--text-muted);
}

.setting-input:focus {
  border-color: var(--text-primary);
}

.setting-input::placeholder {
  color: var(--text-muted);
}

.divider {
  margin: 24px 0;
  border: none;
  border-top: 1px solid var(--border-color);
}

.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.action-btn {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn:hover:not(:disabled) {
  background: var(--bg-tertiary);
  border-color: var(--text-muted);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn .spin {
  animation: spin 1s linear infinite;
}

.header-action-btn .spin {
  animation: spin 1s linear infinite;
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


.viewport-display {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 8px;
}

.viewport-value {
  font-size: 20px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--text-primary);
  letter-spacing: -0.5px;
}

.viewport-label {
  font-size: 12px;
  color: var(--text-muted);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Auth tab */
.auth-status-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  margin-bottom: 16px;
}

.form-result {
  padding: 8px 12px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  margin-bottom: 16px;
}

.form-result.success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: rgb(34, 197, 94);
}

.form-result.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: rgb(239, 68, 68);
}

.auth-hint {
  margin-top: 16px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.auth-hint code {
  font-family: var(--font-mono);
  padding: 2px 5px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
}

@media (max-width: 768px) {
  .modal-overlay {
    padding: 0;
    align-items: stretch;
  }

  .modal-content {
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }
}
</style>
