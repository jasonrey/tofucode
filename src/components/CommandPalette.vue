<script setup>
import { nextTick, onUnmounted, ref, watch } from 'vue';
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
  searchResults,
  searchTruncated,
  searchLoading,
  searchSessions,
  clearSearch,
} = useApi();

// Full-text search across every session transcript, served by
// GET /api/v2/sessions/search. The composable aborts the in-flight request on
// each new query, so we only debounce keystrokes here.
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 50;

const query = ref('');
const selectedIndex = ref(0);
const inputRef = ref(null);
let debounceTimer = null;

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

watch(searchResults, () => {
  selectedIndex.value = 0;
});

function reset() {
  clearTimeout(debounceTimer);
  query.value = '';
  selectedIndex.value = 0;
  clearSearch();
}

function openResult(item) {
  if (!item?.projectSlug || !item?.sessionId) return;
  emit('navigate', {
    name: 'chat',
    params: { project: item.projectSlug, session: item.sessionId },
  });
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (selectedIndex.value < searchResults.value.length - 1)
      selectedIndex.value++;
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (selectedIndex.value > 0) selectedIndex.value--;
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    openResult(searchResults.value[selectedIndex.value]);
  }
}

watch(
  () => props.show,
  (isVisible) => {
    if (isVisible) {
      reset();
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
            placeholder="Search all sessions…"
          />
          <svg v-if="searchLoading" class="spin palette-spinner" width="14" height="14" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
          </svg>
          <kbd v-else class="palette-hint">esc</kbd>
        </div>

        <div class="palette-results">
          <div
            v-for="(item, index) in searchResults"
            :key="`${item.projectSlug}/${item.sessionId}`"
            class="palette-item"
            :class="{ selected: index === selectedIndex }"
            @click="openResult(item)"
            @mouseenter="selectedIndex = index"
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

          <div v-if="searchTruncated" class="palette-note">
            Showing the first {{ searchResults.length }} matches — narrow the query for more.
          </div>

          <div v-if="!searchResults.length" class="palette-empty">
            <p v-if="searchLoading">Searching…</p>
            <p v-else-if="query.trim()">No sessions matching “{{ query.trim() }}”</p>
            <p v-else>Type to search across every session transcript</p>
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

.item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
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
