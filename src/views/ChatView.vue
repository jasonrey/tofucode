<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';
import ChatMessages from '../components/ChatMessages.vue';
import RcControls from '../components/RcControls.vue';
import { useChatWebSocket, useWebSocket } from '../composables/useWebSocket';
import { claudeUrl } from '../utils/slug.js';

const route = useRoute();

// Global WebSocket for live session awareness
const { liveBySessionId, listRcSessions } = useWebSocket();

// Scoped WebSocket for session history
const {
  connected,
  messages,
  currentSession,
  currentProject,
  sessionTitle,
  hasOlderMessages,
  summaryCount,
  sessionActiveElsewhere,
  contextReady,
  loadingOlderMessages,
  totalTurns,
  loadedTurns,
  connect,
  selectProject,
  selectSession,
  loadFullHistory,
  loadOlderMessages,
  clearMessages,
} = useChatWebSocket();

const projectSlug = computed(() => route.params.project);
const sessionParam = computed(() => route.params.session);

// Live RC entry for the current session (null when not running)
const liveSession = computed(
  () => liveBySessionId.value[currentSession.value] ?? null,
);

// claude.ai remote URL — only while the RC bridge is connected
const sessionUrl = computed(() =>
  liveSession.value?.rcActive && liveSession.value?.bridgeSessionId
    ? claudeUrl(liveSession.value.bridgeSessionId)
    : null,
);

// Copy session id to clipboard
const idCopied = ref(false);

async function copySessionId() {
  if (!currentSession.value) return;
  try {
    await navigator.clipboard.writeText(currentSession.value);
    idCopied.value = true;
    setTimeout(() => {
      idCopied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy session id:', err);
  }
}

const chatMessagesRef = ref(null);

// Load session when connected
watch(
  [connected, projectSlug, sessionParam],
  ([isConnected, slug, session]) => {
    if (isConnected && slug && session) {
      selectProject(slug);
      clearMessages();
      nextTick(() => selectSession(session));
    }
  },
  { immediate: true },
);

// Update page title
watch(
  [sessionTitle, currentProject, messages],
  () => {
    const projectName = currentProject.value?.name ?? '';
    let sessionDisplay = sessionTitle.value;

    if (!sessionDisplay && messages.value.length > 0) {
      const firstUserMsg = messages.value.find(
        (m) => m.type === 'text' && m.role === 'user',
      );
      if (firstUserMsg?.text) {
        const text = firstUserMsg.text.trim();
        sessionDisplay =
          text.length > 50 ? `${text.substring(0, 50)}...` : text;
      }
    }

    if (projectName && sessionDisplay) {
      document.title = `${projectName} / ${sessionDisplay}`;
    } else if (projectName) {
      document.title = projectName;
    } else if (sessionDisplay) {
      document.title = `tofucode / ${sessionDisplay}`;
    } else {
      document.title = 'tofucode';
    }
  },
  { deep: true, immediate: true },
);

onMounted(() => {
  connect();
  listRcSessions();
});

onUnmounted(() => {});
</script>

<template>
  <div class="chat-view">
    <AppHeader :debug-session="currentSession">
      <template #content>
        <div class="header-breadcrumb">
          <div v-if="currentProject" class="breadcrumb-folder-group">
            <router-link
              :to="{ name: 'sessions', params: { project: projectSlug } }"
              class="breadcrumb-folder"
            >
              {{ currentProject.name }}
            </router-link>
          </div>
          <span class="breadcrumb-separator">/</span>
          <div class="session-title-row">
            <span class="session-title">{{ sessionTitle || 'Untitled session' }}</span>
          </div>
        </div>
      </template>
    </AppHeader>

    <!-- Session active elsewhere notice -->
    <div v-if="sessionActiveElsewhere" class="session-warning">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>This session is open in another tab.</span>
    </div>

    <!-- Message history (read-only) -->
    <ChatMessages
      ref="chatMessagesRef"
      :messages="messages"
      :is-running="false"
      :is-new-session="false"
      :context-ready="contextReady"
      :has-older-messages="hasOlderMessages"
      :summary-count="summaryCount"
      :loading-older-messages="loadingOlderMessages"
      :total-turns="totalTurns"
      :loaded-turns="loadedTurns"
      @load-full-history="loadFullHistory"
      @load-older-messages="loadOlderMessages"
    />

    <!-- Session info panel -->
    <footer class="session-panel">
      <!-- Session id (click to copy) -->
      <button
        class="panel-item panel-id"
        :title="idCopied ? 'Copied!' : `${currentSession || ''} — click to copy`"
        @click="copySessionId"
      >
        <span class="panel-label">session</span>
        <code class="panel-id-value">{{ currentSession || '—' }}</code>
        <svg v-if="!idCopied" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <svg v-else class="copied-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>

      <!-- RC process details -->
      <div v-if="liveSession" class="panel-item">
        <span class="panel-label">pid</span>
        <code>{{ liveSession.pid }}</code>
        <span class="panel-sep">·</span>
        <span class="panel-status" :class="liveSession.status">{{ liveSession.status }}</span>
        <span class="panel-sep">·</span>
        <span class="panel-rc" :class="{ active: liveSession.rcActive }">
          {{ liveSession.rcActive ? '● remote connected' : '○ awaiting remote' }}
        </span>
      </div>
      <div v-else class="panel-item">
        <span class="panel-status stopped">not running</span>
      </div>

      <!-- Remote URL (when bridge connected) -->
      <a
        v-if="sessionUrl"
        class="panel-item panel-url"
        :href="sessionUrl"
        target="_blank"
        rel="noopener"
        :title="sessionUrl"
      >
        <code class="panel-url-value">{{ sessionUrl.replace('https://', '') }}</code>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
        </svg>
      </a>

      <!-- Start / Stop -->
      <RcControls
        class="panel-controls"
        :session-id="currentSession"
        :project-slug="projectSlug"
      />
    </footer>
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.session-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(245, 158, 11, 0.15);
  border-bottom: 1px solid rgba(245, 158, 11, 0.3);
  color: var(--warning-color);
  font-size: 13px;
}

.session-warning svg {
  flex-shrink: 0;
}

/* ── Session info panel (bottom) ──────────────────────────── */
.session-panel {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.panel-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text-secondary);
}

.panel-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  flex-shrink: 0;
}

.panel-item code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
}

/* Session id — click to copy */
.panel-id {
  padding: 2px 6px;
  margin: -2px -6px;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
  max-width: 280px;
}

.panel-id:hover {
  background: var(--bg-hover);
}

.panel-id svg {
  flex-shrink: 0;
  color: var(--text-muted);
}

.panel-id .copied-icon {
  color: var(--success-color);
}

.panel-id-value {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-sep {
  color: var(--text-muted);
}

.panel-status {
  text-transform: capitalize;
}

.panel-status.busy {
  color: var(--warning-color);
}

.panel-status.idle {
  color: var(--success-color);
}

.panel-status.stopped {
  color: var(--text-muted);
}

.panel-rc {
  color: var(--text-muted);
}

.panel-rc.active {
  color: var(--success-color);
}

/* Remote URL link */
.panel-url {
  text-decoration: none;
  color: var(--success-color);
  padding: 2px 6px;
  margin: -2px -6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
  max-width: 320px;
}

.panel-url:hover {
  background: var(--bg-hover);
}

.panel-url-value {
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-url svg {
  flex-shrink: 0;
}

.panel-controls {
  margin-left: auto;
}

/* Mobile: stack panel items */
@media (max-width: 640px) {
  .session-panel {
    gap: 8px 14px;
  }

  .panel-id {
    max-width: 180px;
  }

  .panel-url {
    max-width: 100%;
  }
}

.header-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.breadcrumb-folder-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.breadcrumb-folder {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.15s;
}

.breadcrumb-folder:hover {
  color: var(--text-primary);
}

.breadcrumb-separator {
  color: var(--text-muted);
  font-size: 14px;
}

.session-title-row {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
}

.session-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

</style>
