<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useApi } from '../composables/useApi';
import { formatRelativeTime } from '../utils/format.js';

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close']);

const router = useRouter();
const {
  projects,
  projectSessions,
  liveBySessionId,
  getProjects,
  loadProjectSessions,
  startNewRcSession,
} = useApi();

// ── Navigation state ────────────────────────────────────────
// Two levels: 'projects' (fuzzy folder filter) → 'sessions' (selected
// project's sessions + quick-start). No full-text scan — everything here
// comes from data already loaded cheaply (the /projects list + lazy
// per-project session cache).
const mode = ref('projects');
const selectedProjectSlug = ref(null);
const query = ref('');
const selectedIndex = ref(0);
const startingSlug = ref(null);
const inputRef = ref(null);

const selectedProject = computed(() =>
  projects.value.find((p) => p.slug === selectedProjectSlug.value),
);

function matches(haystack) {
  return (haystack || '')
    .toLowerCase()
    .includes(query.value.trim().toLowerCase());
}

// Level 1: projects filtered by query (already sorted by recent activity).
const filteredProjects = computed(() => {
  if (!query.value.trim()) return projects.value;
  return projects.value.filter((p) => matches(p.name) || matches(p.slug));
});

// Level 2: the selected project's sessions, filtered by query on title/prompt.
const sessionsEntry = computed(() =>
  selectedProjectSlug.value ? projectSessions[selectedProjectSlug.value] : null,
);
const sessionsLoading = computed(
  () => !!sessionsEntry.value?.loading && !sessionsEntry.value?.loaded,
);
const filteredSessions = computed(() => {
  const list = sessionsEntry.value?.sessions ?? [];
  if (!query.value.trim()) return list;
  return list.filter((s) => matches(s.title) || matches(s.firstPrompt));
});

// Flattened, keyboard-navigable list of the visible items.
const navItems = computed(() => {
  if (mode.value === 'projects') {
    return filteredProjects.value.map((p) => ({ kind: 'project', project: p }));
  }
  return [
    { kind: 'start', slug: selectedProjectSlug.value },
    ...filteredSessions.value.map((s) => ({ kind: 'session', session: s })),
  ];
});

watch(navItems, () => {
  selectedIndex.value = 0;
});

// ── Actions ─────────────────────────────────────────────────
function enterProject(slug) {
  mode.value = 'sessions';
  selectedProjectSlug.value = slug;
  query.value = '';
  selectedIndex.value = 0;
  loadProjectSessions(slug);
  nextTick(() => inputRef.value?.focus());
}

function back() {
  mode.value = 'projects';
  selectedProjectSlug.value = null;
  query.value = '';
  selectedIndex.value = 0;
  nextTick(() => inputRef.value?.focus());
}

function openSession(session) {
  emit('close');
  router.push({
    name: 'chat',
    params: { project: selectedProjectSlug.value, session: session.sessionId },
  });
}

async function startSession(slug) {
  if (startingSlug.value) return;
  startingSlug.value = slug;
  try {
    const result = await startNewRcSession(slug);
    if (result.sessionId) {
      emit('close');
      router.push({
        name: 'chat',
        params: { project: slug, session: result.sessionId },
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

function activate(item) {
  if (!item) return;
  if (item.kind === 'project') enterProject(item.project.slug);
  else if (item.kind === 'session') openSession(item.session);
  else if (item.kind === 'start') startSession(item.slug);
}

// ── Lifecycle ───────────────────────────────────────────────
watch(
  () => props.show,
  (isVisible) => {
    if (isVisible) {
      back();
      getProjects();
      nextTick(() => inputRef.value?.focus());
      document.addEventListener('keydown', handleKeydown);
    } else {
      document.removeEventListener('keydown', handleKeydown);
    }
  },
);

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (mode.value === 'sessions') back();
    else emit('close');
    return;
  }
  // Backspace on an empty query in sessions mode steps back to projects.
  if (e.key === 'Backspace' && mode.value === 'sessions' && !query.value) {
    e.preventDefault();
    back();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (selectedIndex.value < navItems.value.length - 1) selectedIndex.value++;
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (selectedIndex.value > 0) selectedIndex.value--;
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    activate(navItems.value[selectedIndex.value]);
  }
}

const placeholder = computed(() =>
  mode.value === 'projects'
    ? 'Search projects…'
    : `Search sessions in ${selectedProject.value?.name ?? 'project'}…`,
);
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="palette-overlay" @click="$emit('close')">
      <div class="palette" @click.stop>
        <div class="palette-input-wrapper">
          <button v-if="mode === 'sessions'" class="palette-back" title="Back (esc)" @click="back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <svg v-else class="palette-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            class="palette-input"
            :placeholder="placeholder"
          />
          <kbd class="palette-hint">esc</kbd>
        </div>

        <!-- Level 1: projects -->
        <div v-if="mode === 'projects'" class="palette-results">
          <template v-if="filteredProjects.length">
            <div
              v-for="(item, index) in navItems"
              :key="item.project.slug"
              class="palette-item"
              :class="{ selected: index === selectedIndex }"
              @click="activate(item)"
              @mouseenter="selectedIndex = index"
            >
              <span class="item-icon">📁</span>
              <div class="item-content">
                <span class="item-title">{{ item.project.name }}</span>
              </div>
              <span class="item-count">{{ item.project.sessionCount }}</span>
              <svg class="item-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          </template>
          <div v-else class="palette-empty">
            <p>No projects found</p>
          </div>
        </div>

        <!-- Level 2: a project's sessions + quick start -->
        <div v-else class="palette-results">
          <div
            class="palette-item palette-item-start"
            :class="{ selected: selectedIndex === 0 }"
            @click="activate(navItems[0])"
            @mouseenter="selectedIndex = 0"
          >
            <span v-if="startingSlug === selectedProjectSlug" class="item-icon">
              <svg class="spin" width="14" height="14" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
              </svg>
            </span>
            <span v-else class="item-icon">＋</span>
            <div class="item-content">
              <span class="item-title">
                {{ startingSlug === selectedProjectSlug ? 'Starting…' : 'Start new session here' }}
              </span>
            </div>
          </div>

          <div v-if="sessionsLoading" class="palette-empty">
            <p>Loading sessions…</p>
          </div>
          <template v-else>
            <div
              v-for="(item, index) in navItems.slice(1)"
              :key="item.session.sessionId"
              class="palette-item"
              :class="{ selected: index + 1 === selectedIndex }"
              @click="activate(item)"
              @mouseenter="selectedIndex = index + 1"
            >
              <span class="item-icon">💬</span>
              <div class="item-content">
                <span class="item-title">
                  {{ item.session.title || item.session.firstPrompt || 'Untitled' }}
                </span>
              </div>
              <span v-if="liveBySessionId[item.session.sessionId]" class="item-live">● live</span>
              <span v-else class="item-count">{{ formatRelativeTime(item.session.modified) }}</span>
            </div>
            <div v-if="!filteredSessions.length" class="palette-empty">
              <p>No sessions{{ query ? ' matching “' + query + '”' : '' }}</p>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.palette-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  padding-top: 15vh;
  z-index: 1000;
}

.palette {
  width: 100%;
  max-width: 500px;
  max-height: 400px;
  margin: 0 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.palette-input-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.palette-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.palette-back {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  transition: color 0.15s;
}

.palette-back:hover {
  color: var(--text-primary);
}

.palette-input {
  flex: 1;
  font-size: 14px;
  background: transparent;
  color: var(--text-primary);
}

.palette-input::placeholder {
  color: var(--text-muted);
}

.palette-hint {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.palette-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.1s;
}

.palette-item:hover,
.palette-item.selected {
  background: var(--bg-hover);
}

.palette-item.selected {
  background: var(--bg-tertiary);
}

.palette-item-start {
  color: var(--text-secondary);
}

.item-icon {
  flex-shrink: 0;
  font-size: 14px;
  display: flex;
  align-items: center;
}

.item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-count {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.item-live {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--success-color);
}

.item-chevron {
  flex-shrink: 0;
  color: var(--text-muted);
}

.palette-empty {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
