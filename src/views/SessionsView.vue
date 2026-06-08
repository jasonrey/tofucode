<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';
import RcBadge from '../components/RcBadge.vue';
import RcClaudeLink from '../components/RcClaudeLink.vue';
import RcControls from '../components/RcControls.vue';
import { useWebSocket } from '../composables/useWebSocket';
import { formatRelativeTime } from '../utils/format.js';

const router = useRouter();
const route = useRoute();
const {
  connected,
  sessions,
  selectedProject,
  connect,
  selectProject,
  deleteSession,
  liveBySessionId,
  listRcSessions,
  startNewRcSession,
} = useWebSocket();

const projectSlug = computed(() => route.params.project);

// Project info from the project_selected response (matches current slug)
const projectInfo = computed(() => {
  const selected = selectedProject.value;
  if (selected && selected.slug === projectSlug.value) return selected;
  return {
    slug: projectSlug.value,
    name: projectSlug.value,
    path: '',
  };
});

// Connect on mount and load sessions when ready
onMounted(() => {
  connect(() => {
    // This callback runs once connection is ready
    if (projectSlug.value) {
      selectProject(projectSlug.value);
    }
    listRcSessions();
  });
});

// Watch for project changes (when navigating via sidebar)
watch(projectSlug, (newSlug) => {
  if (connected.value && newSlug) {
    selectProject(newSlug);
  }
});

function selectSession(sessionId) {
  router.push({
    name: 'chat',
    params: { project: projectSlug.value, session: sessionId },
  });
}

// New session = spawn an RC process for this project, then open it
const startingSession = ref(false);

async function startNewSession() {
  if (startingSession.value) return;
  startingSession.value = true;
  try {
    const result = await startNewRcSession(projectSlug.value);
    if (result.sessionId) {
      router.push({
        name: 'chat',
        params: { project: projectSlug.value, session: result.sessionId },
      });
    } else {
      alert(result.message || 'Failed to start session');
    }
  } catch (err) {
    alert(`Failed to start session: ${err.message}`);
  } finally {
    startingSession.value = false;
  }
}

// Use shared utility
const formatTime = formatRelativeTime;

function handleDeleteSession(sessionId, event) {
  event.stopPropagation();
  if (confirm('Are you sure you want to delete this session?')) {
    deleteSession(sessionId);
  }
}
</script>

<template>
  <div class="sessions-view">
    <AppHeader
      :title="projectInfo.name"
      :subtitle="projectInfo.path"
    />

    <main class="main">
      <ul class="sessions">
        <!-- New Session as first item -->
        <li class="session-item new-session" :class="{ starting: startingSession }" @click="startNewSession">
          <div class="session-icon new">
            <svg v-if="!startingSession" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            <svg v-else class="spin" width="20" height="20" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="session-content">
            <p class="session-prompt">{{ startingSession ? 'Starting session…' : 'New Session' }}</p>
            <p class="session-meta">Spawns a Claude session on the VM</p>
          </div>
          <div class="session-arrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        </li>

        <!-- Existing sessions -->
        <li
          v-for="session in sessions"
          :key="session.sessionId"
          class="session-item"
        >
          <a
            :href="`/project/${projectSlug}/session/${session.sessionId}`"
            class="session-link"
            @click.prevent="selectSession(session.sessionId)"
          >
            <div class="session-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div class="session-content">
            <div class="session-title-row">
              <p class="session-prompt truncate">{{ session.title || session.firstPrompt }}</p>
              <RcBadge
                v-if="liveBySessionId[session.sessionId]"
                :entrypoint="liveBySessionId[session.sessionId].entrypoint"
                :status="liveBySessionId[session.sessionId].status"
                :rc-active="liveBySessionId[session.sessionId].rcActive"
              />
              <RcClaudeLink :live="liveBySessionId[session.sessionId]" />
            </div>
            <p v-if="session.title" class="session-subtitle truncate">{{ session.firstPrompt }}</p>
            <p class="session-meta">
              <span>{{ formatTime(session.modified) }}</span>
              <span class="separator">·</span>
              <span>{{ session.messageCount }} messages</span>
            </p>
            <RcControls :session-id="session.sessionId" :project-slug="projectSlug" />
          </div>
            <div class="session-arrow">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          </a>
          <button
            class="delete-session-btn"
            @click.stop="handleDeleteSession(session.sessionId, $event)"
            title="Delete session"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </li>
      </ul>

      <div class="empty" v-if="sessions.length === 0 && connected">
        <p>No sessions yet.</p>
        <p class="empty-hint">Click "New Session" above to begin.</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.sessions-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.main {
  padding: 0 16px;
}

.sessions {
  list-style: none;
}

.session-item {
  position: relative;
  display: flex;
  align-items: center;
  margin: 0 -12px;
  border-radius: var(--radius-md);
  transition: background 0.15s;
}

.session-item:hover {
  background: var(--bg-hover);
}

.session-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  flex: 1;
  min-width: 0;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.session-item.new-session {
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
  cursor: pointer;
  padding: 12px;
}

.session-item.new-session {
  gap: 12px;
}

.session-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}

.session-icon.new {
  background: var(--bg-tertiary);
  border: 1px dashed var(--text-muted);
  color: var(--text-secondary);
}

.session-content {
  flex: 1;
  min-width: 0;
}

.session-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.session-prompt {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.session-subtitle {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.session-meta {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--text-secondary);
}

.separator {
  margin: 0 6px;
  flex-shrink: 0;
}

.delete-session-btn {
  margin: 0 8px;
  padding: 8px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.delete-session-btn:hover {
  background: #ef4444;
  color: white;
}

.session-arrow {
  flex-shrink: 0;
  color: var(--text-muted);
}

.session-item.new-session.starting {
  opacity: 0.7;
  cursor: wait;
}

.empty {
  text-align: center;
  padding: 32px 0;
  color: var(--text-secondary);
}

.empty-hint {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-muted);
}
</style>
