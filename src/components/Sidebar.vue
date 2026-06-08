<script setup>
import { computed, inject, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useWebSocket } from '../composables/useWebSocket';
import RcBadge from './RcBadge.vue';
import RcClaudeLink from './RcClaudeLink.vue';
import SidebarProjectGroup from './SidebarProjectGroup.vue';

const props = defineProps({
  open: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['close', 'open-settings']);

const route = useRoute();
const router = useRouter();
const {
  connected,
  recentSessions,
  sessionsReady,
  currentVersion,
  updateAvailable,
  liveSessions,
  liveBySessionId,
  getRecentSessionsImmediate,
  listRcSessions,
  startNewRcSession,
  dismissUpdate,
  send,
  onMessage,
} = useWebSocket();

const newProject = inject('newProject', null);

// ── Tabs: recent (grouped) | live (flat, running sessions) ──
const TAB_KEY = 'tofucode:sidebar-tab';
const activeTab = ref(
  localStorage.getItem(TAB_KEY) === 'live' ? 'live' : 'recent',
);

function setTab(tab) {
  activeTab.value = tab;
  localStorage.setItem(TAB_KEY, tab);
}

// ── Unified project groups from recent sessions ─────────────
const groups = computed(() => {
  const map = new Map();
  for (const session of recentSessions.value) {
    let group = map.get(session.projectSlug);
    if (!group) {
      group = {
        slug: session.projectSlug,
        name: session.projectName,
        path: session.projectPath,
        sessions: [],
        lastModified: session.modified,
      };
      map.set(session.projectSlug, group);
    }
    group.sessions.push(session);
    if (session.modified > group.lastModified) {
      group.lastModified = session.modified;
    }
  }
  return [...map.values()].sort((a, b) =>
    (b.lastModified || '').localeCompare(a.lastModified || ''),
  );
});

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
  }
  localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
}

// Auto-expand the current route's project
watch(
  () => route.params.project,
  (slug) => {
    if (slug && !expanded.has(slug)) {
      expanded.add(slug);
    }
  },
  { immediate: true },
);

const currentSession = computed(() => route.params.session ?? null);

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

// ── Live tab: flat list of running sessions ─────────────────
// Enrich live entries with title/project name from recentSessions
const liveList = computed(() => {
  const recentById = {};
  for (const s of recentSessions.value) recentById[s.sessionId] = s;
  return liveSessions.value.map((live) => {
    const recent = recentById[live.sessionId];
    return {
      ...live,
      title:
        recent?.title ||
        recent?.firstPrompt ||
        live.sessionId?.slice(0, 8) ||
        'Untitled',
      projectName:
        recent?.projectName || live.cwd?.split('/').pop() || live.projectSlug,
    };
  });
});

function openLiveSession(live) {
  if (!live.projectSlug || !live.sessionId) return;
  router.push({
    name: 'chat',
    params: { project: live.projectSlug, session: live.sessionId },
  });
}

// ── Upgrade ─────────────────────────────────────────────────
const isUpgrading = ref(false);

watch(connected, (isConnected) => {
  if (isConnected) {
    isUpgrading.value = false;
    fetchData();
  }
});

onMessage((msg) => {
  if (msg.type === 'upgrade_error' || msg.type === 'restart_error') {
    isUpgrading.value = false;
    alert(`Upgrade failed: ${msg.message}`);
  }
});

function handleUpgrade() {
  if (isUpgrading.value) return;
  const version = updateAvailable.value?.latestVersion || 'latest';
  const confirmed = confirm(
    `Upgrade tofucode to v${version}?\n\nThis will:\n1. Download and install the update\n2. Restart the server\n3. Automatically reconnect\n\nThis may take 30-60 seconds.`,
  );
  if (confirmed) {
    isUpgrading.value = true;
    send({ type: 'upgrade', version });
  }
}

function handleDismissUpdate(e) {
  e.stopPropagation();
  if (updateAvailable.value) {
    dismissUpdate(updateAvailable.value.latestVersion);
  }
}

// ── Data fetching ───────────────────────────────────────────
function fetchData() {
  if (connected.value) {
    getRecentSessionsImmediate();
    listRcSessions();
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) fetchData();
  },
);

onMounted(fetchData);
</script>

<template>
  <aside class="sidebar" :class="{ open }">
    <!-- Header: logo, version, upgrade, settings -->
    <div class="sidebar-header">
      <router-link :to="{ name: 'home' }" class="sidebar-title">
        <img src="/icons/icon-192.png" alt="tofucode" class="sidebar-logo" />
      </router-link>

      <span v-if="currentVersion" class="current-version">v{{ currentVersion }}</span>

      <div v-if="updateAvailable" class="upgrade-btn-wrapper">
        <button
          class="upgrade-btn"
          :disabled="isUpgrading"
          :title="`Upgrade to v${updateAvailable.latestVersion}`"
          @click="handleUpgrade"
        >
          <svg v-if="!isUpgrading" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19V5M5 12l7-7 7 7"/>
          </svg>
          <svg v-else class="spin" width="12" height="12" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
          </svg>
          <span>v{{ updateAvailable.latestVersion }}</span>
        </button>
        <button class="dismiss-btn" title="Dismiss" @click="handleDismissUpdate">×</button>
      </div>

      <button class="sidebar-icon-btn" title="Settings (Ctrl+,)" @click="$emit('open-settings')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
    </div>

    <!-- Tabs: recent (grouped) | live (running) -->
    <div class="sidebar-tabs">
      <button
        class="sidebar-tab"
        :class="{ active: activeTab === 'recent' }"
        @click="setTab('recent')"
      >
        Recent
      </button>
      <button
        class="sidebar-tab"
        :class="{ active: activeTab === 'live' }"
        @click="setTab('live')"
      >
        Live
        <span v-if="liveList.length" class="tab-count">{{ liveList.length }}</span>
      </button>
    </div>

    <!-- Recent tab: unified project/session list -->
    <div v-if="activeTab === 'recent'" class="sidebar-content">
      <!-- Skeleton while loading -->
      <ul v-if="!sessionsReady" class="group-list">
        <li v-for="i in 4" :key="i" class="skeleton-row">
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-line skeleton-meta"></div>
        </li>
      </ul>

      <ul v-else-if="groups.length" class="group-list">
        <SidebarProjectGroup
          v-for="group in groups"
          :key="group.slug"
          :group="group"
          :expanded="expanded.has(group.slug)"
          :live-by-session-id="liveBySessionId"
          :current-session="currentSession"
          :starting="startingSlug === group.slug"
          @toggle="toggleGroup(group.slug)"
          @new-session="startNewSession(group)"
          @open-session="(session) => openSession(group, session)"
          @view-all="viewAll(group)"
        />
      </ul>

      <div v-else class="sidebar-empty">
        <p>No sessions yet</p>
        <p class="hint">Browse to a folder and start one</p>
      </div>
    </div>

    <!-- Live tab: flat list of running sessions -->
    <div v-else class="sidebar-content">
      <ul v-if="liveList.length" class="group-list">
        <li
          v-for="live in liveList"
          :key="live.sessionId"
          class="live-row"
          :class="{ active: currentSession === live.sessionId }"
          @click="openLiveSession(live)"
        >
          <div class="live-main">
            <span class="live-title truncate">{{ live.title }}</span>
            <span class="live-project truncate">{{ live.projectName }}</span>
          </div>
          <RcClaudeLink :live="live" />
          <RcBadge
            :entrypoint="live.entrypoint"
            :status="live.status"
            :rc-active="live.rcActive"
          />
        </li>
      </ul>
      <div v-else class="sidebar-empty">
        <p>No live sessions</p>
        <p class="hint">Start one with ＋ on a project</p>
      </div>
    </div>

    <!-- Footer: new project -->
    <div class="sidebar-footer">
      <button class="new-project-btn" @click="newProject?.open()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          <line x1="12" y1="11" x2="12" y2="17"/>
          <line x1="9" y1="14" x2="15" y2="14"/>
        </svg>
        New project
      </button>
    </div>
  </aside>

  <!-- Overlay for tablet/mobile — teleported so it isn't a grid child -->
  <Teleport to="body">
    <div v-if="open" class="sidebar-overlay" @click="$emit('close')"></div>
  </Teleport>
</template>

<style scoped>
.sidebar {
  display: none;
  flex-direction: column;
  width: var(--sidebar-width);
  height: 100%;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar.open {
  display: flex;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  min-height: 57px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-title {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.sidebar-logo {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
}

.current-version {
  flex: 1;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.upgrade-btn-wrapper {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.upgrade-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: var(--radius-sm);
  color: var(--success-color);
  cursor: pointer;
  transition: all 0.15s;
}

.upgrade-btn:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.2);
}

.upgrade-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.dismiss-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  font-size: 13px;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  transition: all 0.15s;
}

.dismiss-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.sidebar-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  flex-shrink: 0;
  transition: all 0.15s;
}

.sidebar-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Tabs */
.sidebar-tabs {
  display: flex;
  gap: 2px;
  padding: 6px 8px 0;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.sidebar-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.sidebar-tab:hover {
  color: var(--text-secondary);
}

.sidebar-tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-color);
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 8px;
  background: rgba(34, 197, 94, 0.15);
  color: var(--success-color);
}

.sidebar-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

/* Live tab rows */
.live-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  list-style: none;
  transition: background 0.1s;
}

.live-row:hover {
  background: var(--bg-hover);
}

.live-row.active {
  background: var(--bg-tertiary);
}

.live-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.live-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.live-project {
  font-size: 11px;
  color: var(--text-muted);
}

.group-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.sidebar-empty .hint {
  margin-top: 4px;
  font-size: 11px;
}

.sidebar-footer {
  padding: 10px 12px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.new-project-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s;
}

.new-project-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--text-muted);
}

/* Skeleton loading */
.skeleton-row {
  list-style: none;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skeleton-line {
  height: 10px;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

.skeleton-title {
  width: 70%;
}

.skeleton-meta {
  width: 45%;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ≤1024px: sidebar as fixed overlay */
@media (max-width: 1024px) {
  .sidebar.open {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    height: auto;
    z-index: 200;
    width: var(--sidebar-width);
  }
}

/* Mobile: full width overlay */
@media (max-width: 640px) {
  .sidebar.open {
    width: 100vw;
  }
}
</style>
