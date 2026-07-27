<script setup>
import { computed, onMounted, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';
import RcBadge from '../components/RcBadge.vue';
import RcClaudeLink from '../components/RcClaudeLink.vue';
import { useApi } from '../composables/useApi';

const router = useRouter();
const {
  projects,
  projectSessions,
  recentSessions,
  liveSessions,
  getProjects,
  loadProjectSessions,
  listRcSessions,
  stopRcSession,
} = useApi();

// Project display names from the folder list (cheap, always loaded).
const projectNameBySlug = computed(() => {
  const map = {};
  for (const p of projects.value) map[p.slug] = p.name;
  return map;
});

// Resolve a session's title from the lazy per-project cache, falling back to
// recent sessions. Looked up per live entry — only the handful of live
// sessions are resolved, not the whole cache.
function titleFor(live) {
  const known =
    projectSessions[live.projectSlug]?.sessions.find(
      (s) => s.sessionId === live.sessionId,
    ) ?? recentSessions.value.find((s) => s.sessionId === live.sessionId);
  return (
    known?.title ||
    known?.firstPrompt ||
    live.sessionId?.slice(0, 8) ||
    'Untitled'
  );
}

const liveList = computed(() => {
  const names = projectNameBySlug.value;
  return liveSessions.value.map((live) => ({
    ...live,
    title: titleFor(live),
    projectName:
      names[live.projectSlug] || live.cwd?.split('/').pop() || live.projectSlug,
  }));
});

// Lazily load sessions for just the projects that have a live session, so
// their titles resolve without scanning everything.
watch(
  liveSessions,
  () => {
    const slugs = new Set(
      liveSessions.value.map((l) => l.projectSlug).filter(Boolean),
    );
    for (const slug of slugs) loadProjectSessions(slug);
  },
  { immediate: true },
);

function openLiveSession(live) {
  if (!live.projectSlug || !live.sessionId) return;
  router.push({
    name: 'chat',
    params: { project: live.projectSlug, session: live.sessionId },
  });
}

// Stop a live session in place — no need to open its history first.
const stopping = reactive(new Set());
async function stopLive(live) {
  if (stopping.has(live.sessionId)) return;
  stopping.add(live.sessionId);
  try {
    await stopRcSession({ sessionId: live.sessionId });
  } catch (err) {
    alert(`Failed to stop session: ${err.message}`);
  } finally {
    stopping.delete(live.sessionId);
  }
}

onMounted(() => {
  document.title = 'Live · tofucode';
  // projects backs the name lookup — needed on a cold deep-link to /live
  getProjects();
  listRcSessions();
});
</script>

<template>
  <div class="live-view">
    <AppHeader title="Live" subtitle="Running claude sessions on this machine" />

    <div class="live-body">
      <ul v-if="liveList.length" class="live-list">
        <li v-for="live in liveList" :key="live.sessionId" class="live-row">
          <div class="live-main" @click="openLiveSession(live)">
            <span class="live-title truncate">{{ live.title }}</span>
            <span class="live-project truncate">{{ live.projectName }}</span>
          </div>
          <RcClaudeLink :live="live" />
          <RcBadge
            :entrypoint="live.entrypoint"
            :status="live.status"
            :rc-active="live.rcActive"
          />
          <div class="live-actions">
            <button class="live-action-btn" title="Open history" @click="openLiveSession(live)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <button
              class="live-action-btn live-stop-btn"
              :disabled="stopping.has(live.sessionId)"
              title="Stop session"
              @click="stopLive(live)"
            >
              <svg v-if="stopping.has(live.sessionId)" class="spin" width="15" height="15" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14" rx="2"/>
              </svg>
            </button>
          </div>
        </li>
      </ul>

      <div v-else class="view-empty">
        <p>No live sessions</p>
        <p class="hint">Start one with ＋ on a folder in Recent</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.live-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 8px;
}

.live-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.live-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  transition: background 0.1s;
}

.live-row:hover {
  background: var(--bg-hover);
}

.live-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
}

.live-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.live-project {
  font-size: 12px;
  color: var(--text-muted);
}

.live-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.live-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.live-action-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.live-stop-btn:hover:not(:disabled) {
  color: var(--error-color);
  background: color-mix(in srgb, var(--error-color) 12%, transparent);
}

.live-action-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.view-empty {
  padding: 48px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.view-empty .hint {
  margin-top: 4px;
  font-size: 12px;
}
</style>
