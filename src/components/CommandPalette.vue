<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useApi } from '../composables/useApi';
import { formatRelativeTime } from '../utils/format.js';

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
});

// `navigate` rather than a local router.push: App.vue owns the back-button
// sentinel and must consume it before navigating (see useBackButton).
const emit = defineEmits(['close', 'navigate']);

const {
  projects,
  searchResults,
  searchTruncated,
  searchLoading,
  getProjects,
  searchSessions,
  clearSearch,
  startNewRcSession,
} = useApi();

// Two result groups. Folders match name/path against the already-loaded
// /projects list — instant, no request, so they pin above the transcript hits
// and stay usable as a launcher while the slower search resolves.
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 50;

const query = ref('');
const selectedIndex = ref(0);
const inputRef = ref(null);
const startingSlug = ref(null);
let debounceTimer = null;

const matchedProjects = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return projects.value;
  return projects.value.filter(
    (p) =>
      p.name?.toLowerCase().includes(q) || p.path?.toLowerCase().includes(q),
  );
});

// Flat keyboard-navigable list: folders first, then transcript matches.
const navItems = computed(() => [
  ...matchedProjects.value.map((project) => ({ kind: 'project', project })),
  ...searchResults.value.map((session) => ({ kind: 'session', session })),
]);

const projectCount = computed(() => matchedProjects.value.length);

function runSearch() {
  // reset() blanks the query on close, which re-arms this watcher — don't let a
  // trailing timer fire against a closed palette.
  if (!props.show) return;
  const q = query.value.trim();
  if (!q) {
    clearSearch();
    return;
  }
  searchSessions(q, { limit: SEARCH_LIMIT });
}

watch(query, () => {
  selectedIndex.value = 0;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
});

watch(navItems, () => {
  selectedIndex.value = 0;
});

function reset() {
  clearTimeout(debounceTimer);
  query.value = '';
  selectedIndex.value = 0;
  clearSearch();
}

function openSession(session) {
  if (!session?.projectSlug || !session?.sessionId) return;
  emit('navigate', {
    name: 'chat',
    params: { project: session.projectSlug, session: session.sessionId },
  });
}

function openProject(project) {
  emit('navigate', { name: 'sessions', params: { project: project.slug } });
}

// Start a session straight from a folder hit — the palette stays open with a
// spinner because the RC spawn blocks for up to ~22s.
async function startSession(project) {
  if (startingSlug.value) return;
  startingSlug.value = project.slug;
  try {
    const result = await startNewRcSession(project.slug);
    if (result.sessionId) {
      emit('navigate', {
        name: 'chat',
        params: { project: project.slug, session: result.sessionId },
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

function activate(item, { start = false } = {}) {
  if (!item) return;
  if (item.kind === 'project') {
    if (start) startSession(item.project);
    else openProject(item.project);
  } else {
    openSession(item.session);
  }
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
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
    // Ctrl/Cmd+Enter on a folder starts a session there — the ＋ button's
    // keyboard equivalent.
    activate(navItems.value[selectedIndex.value], {
      start: e.ctrlKey || e.metaKey,
    });
  }
}

watch(
  () => props.show,
  (isVisible) => {
    if (isVisible) {
      reset();
      // Folder list is the palette's launcher surface — keep it fresh on open.
      getProjects();
      nextTick(() => inputRef.value?.focus());
      document.addEventListener('keydown', handleKeydown);
    } else {
      reset();
      document.removeEventListener('keydown', handleKeydown);
    }
  },
);

onUnmounted(() => {
  clearTimeout(debounceTimer);
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="palette-overlay" @click="$emit('close')">
      <div class="palette" @click.stop>
        <div class="palette-input-wrapper">
          <svg class="palette-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            class="palette-input"
            placeholder="Search folders and sessions…"
          />
          <svg v-if="searchLoading" class="spin palette-spinner" width="14" height="14" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
          </svg>
          <kbd v-else class="palette-hint">esc</kbd>
        </div>

        <div class="palette-results">
          <!-- Folders — pinned above session hits, each a one-click launcher -->
          <template v-if="projectCount">
            <div class="section-label">Folders</div>
            <div
              v-for="(project, index) in matchedProjects"
              :key="project.slug"
              class="palette-item"
              :class="{ selected: index === selectedIndex }"
              @click="openProject(project)"
              @mouseenter="selectedIndex = index"
            >
              <svg class="item-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <div class="item-content">
                <span class="item-title truncate">{{ project.name }}</span>
                <span class="item-path truncate">{{ project.path }}</span>
              </div>
              <span class="item-count">{{ project.sessionCount }}</span>
              <button
                class="item-new-btn"
                :disabled="!!startingSlug"
                :title="startingSlug === project.slug ? 'Starting…' : 'Start a session here (Ctrl+Enter)'"
                @click.stop="startSession(project)"
              >
                <svg v-if="startingSlug === project.slug" class="spin" width="13" height="13" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
                </svg>
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>
          </template>

          <!-- Transcript matches -->
          <template v-if="searchResults.length">
            <div class="section-label">Sessions</div>
            <div
              v-for="(item, index) in searchResults"
              :key="`${item.projectSlug}/${item.sessionId}`"
              class="palette-item"
              :class="{ selected: projectCount + index === selectedIndex }"
              @click="openSession(item)"
              @mouseenter="selectedIndex = projectCount + index"
            >
              <div class="item-content">
                <div class="item-line">
                  <span class="item-title truncate">
                    {{ item.title || 'Untitled' }}
                  </span>
                  <span class="item-count">{{ item.matchCount }}</span>
                </div>
                <span class="item-project truncate">
                  {{ item.projectName }}
                  <template v-if="item.timestamp"> · {{ formatRelativeTime(item.timestamp) }}</template>
                </span>
                <p v-if="item.snippets?.length" class="item-snippet">{{ item.snippets[0] }}</p>
              </div>
            </div>
          </template>

          <div v-if="searchTruncated" class="palette-note">
            Showing the first {{ searchResults.length }} session matches — narrow the query for more.
          </div>

          <!-- Folders resolve instantly; sessions lag behind the debounce -->
          <div v-if="query.trim() && !searchResults.length" class="palette-note">
            <template v-if="searchLoading">Searching transcripts…</template>
            <template v-else>No transcript matches for “{{ query.trim() }}”</template>
          </div>

          <div v-if="!navItems.length && !searchLoading" class="palette-empty">
            <p v-if="query.trim()">Nothing matching “{{ query.trim() }}”</p>
            <p v-else>Search folders by name or path, and sessions by content</p>
          </div>
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
  padding-top: 12vh;
  z-index: 1000;
}

.palette {
  width: 100%;
  max-width: 560px;
  max-height: 60vh;
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

.palette-spinner {
  flex-shrink: 0;
  color: var(--text-muted);
}

.palette-input {
  flex: 1;
  min-width: 0;
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
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.1s;
}

.palette-item:hover,
.palette-item.selected {
  background: var(--bg-tertiary);
}

.section-label {
  padding: 8px 12px 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.item-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-path {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.item-new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  flex-shrink: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.item-new-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.item-new-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.item-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.item-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.item-count {
  flex-shrink: 0;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.item-project {
  font-size: 11px;
  color: var(--text-muted);
}

.item-snippet {
  margin-top: 3px;
  font-size: 12px;
  font-family: var(--font-mono);
  line-height: 1.45;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.palette-note {
  padding: 10px 12px;
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}

.palette-empty {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
