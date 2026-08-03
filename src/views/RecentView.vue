<script setup>
import { computed, inject, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';
import ProjectGroup from '../components/ProjectGroup.vue';
import { useApi } from '../composables/useApi';

const router = useRouter();
const {
  projects,
  projectsReady,
  projectSessions,
  liveBySessionId,
  getProjects,
  loadProjectSessions,
  listRcSessions,
  startNewRcSession,
  startRcSession,
  stopRcSession,
} = useApi();

const palette = inject('palette', null);

// ── Project groups (folder list) ────────────────────────────
// Sourced from the cheap stat-only /projects endpoint, already sorted by
// recent activity server-side. Inner sessions load lazily on expand.
const groups = computed(() => projects.value);

function sessionsFor(slug) {
  return projectSessions[slug]?.sessions ?? [];
}
function isLoadingSessions(slug) {
  const entry = projectSessions[slug];
  return !!entry?.loading && !entry?.loaded;
}

// ── Expand/collapse state (persisted) ───────────────────────
const EXPANDED_KEY = 'tofucode:expanded-projects';

function loadExpanded() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXPANDED_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

const expanded = reactive(loadExpanded());

function toggleGroup(slug) {
  if (expanded.has(slug)) {
    expanded.delete(slug);
  } else {
    expanded.add(slug);
    loadProjectSessions(slug);
  }
  localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
}

// ── New session (rc:start via shared serialized action) ─────
const startingSlug = ref(null);

async function startNewSession(group) {
  if (startingSlug.value) return;
  startingSlug.value = group.slug;
  try {
    const result = await startNewRcSession(group.slug);
    if (result.sessionId) {
      router.push({
        name: 'chat',
        params: { project: group.slug, session: result.sessionId },
      });
    } else {
      alert(result.message || 'Failed to start session');
    }
  } catch (err) {
    alert(`Failed to start session: ${err.message}`);
  } finally {
    startingSlug.value = null;
  }
}

function openSession(group, session) {
  router.push({
    name: 'chat',
    params: { project: group.slug, session: session.sessionId },
  });
}

function viewAll(group) {
  router.push({ name: 'sessions', params: { project: group.slug } });
}

// ── Per-session resume / stop ───────────────────────────────
// Row-level so a session can be woken or killed without opening it first.
const pendingSessions = reactive(new Set());

async function resumeSession(group, session) {
  const id = session.sessionId;
  if (pendingSessions.has(id)) return;
  pendingSessions.add(id);
  try {
    const result = await startRcSession({
      projectSlug: group.slug,
      sessionId: id,
      allowFallbackToNew: false,
    });
    if (result.status === 'failed') {
      alert(result.message || 'Failed to resume session');
    }
  } catch (err) {
    alert(`Failed to resume session: ${err.message}`);
  } finally {
    pendingSessions.delete(id);
  }
}

async function stopSession(session) {
  const id = session.sessionId;
  if (pendingSessions.has(id)) return;
  pendingSessions.add(id);
  try {
    await stopRcSession({ sessionId: id });
  } catch (err) {
    alert(`Failed to stop session: ${err.message}`);
  } finally {
    pendingSessions.delete(id);
  }
}

// ── Data fetching ───────────────────────────────────────────
// This view is the app's refresh pump: without the force-refresh, sessions
// created outside tofucode never appear and counts drift from the rows.
onMounted(() => {
  document.title = 'Recent · tofucode';
  getProjects();
  listRcSessions();
  for (const slug of expanded) loadProjectSessions(slug, { force: true });
});
</script>

<template>
  <div class="recent-view">
    <AppHeader title="Recent" subtitle="Sessions grouped by folder">
      <template #actions>
        <button class="header-icon-btn" title="Search sessions (Ctrl+K)" @click="palette?.open()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
      </template>
    </AppHeader>

    <div class="recent-body">
      <!-- Skeleton while loading -->
      <ul v-if="!projectsReady" class="group-list">
        <li v-for="i in 5" :key="i" class="skeleton-row">
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-line skeleton-meta"></div>
        </li>
      </ul>

      <ul v-else-if="groups.length" class="group-list">
        <ProjectGroup
          v-for="group in groups"
          :key="group.slug"
          :group="group"
          :sessions="sessionsFor(group.slug)"
          :loading="isLoadingSessions(group.slug)"
          :expanded="expanded.has(group.slug)"
          :live-by-session-id="liveBySessionId"
          :starting="startingSlug === group.slug"
          :pending-sessions="pendingSessions"
          @toggle="toggleGroup(group.slug)"
          @new-session="startNewSession(group)"
          @open-session="(session) => openSession(group, session)"
          @start-session="(session) => resumeSession(group, session)"
          @stop-session="stopSession"
          @view-all="viewAll(group)"
        />
      </ul>

      <div v-else class="view-empty">
        <p>No sessions yet</p>
        <p class="hint">Browse to a folder and start one</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recent-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.recent-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 8px;
}

.group-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.header-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  transition: background 0.15s, color 0.15s;
}

.header-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
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

/* Skeleton loading */
.skeleton-row {
  list-style: none;
  padding: 11px 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.skeleton-line {
  height: 10px;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

.skeleton-title {
  width: 60%;
}

.skeleton-meta {
  width: 35%;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
