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
  sessions: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['close']);

const router = useRouter();
const {
  searchResults,
  searchLoading,
  searchTruncated,
  searchSessions,
  clearSearch,
} = useApi();

const searchQuery = ref('');
const selectedIndex = ref(0);
const inputRef = ref(null);

// Full-text search debounce
let searchTimer = null;
watch(searchQuery, (val) => {
  clearTimeout(searchTimer);
  if (!val.trim()) {
    clearSearch();
    return;
  }
  searchTimer = setTimeout(() => searchSessions(val.trim()), 300);
});

// Group recent sessions by project (shown only when not searching)
const groupedSessions = computed(() => {
  const groups = {};
  for (const session of props.sessions) {
    const projectSlug = session.projectSlug;
    if (!groups[projectSlug]) {
      groups[projectSlug] = {
        projectSlug,
        projectName: session.projectName,
        sessions: [],
      };
    }
    groups[projectSlug].sessions.push(session);
  }

  return Object.values(groups)
    .map((group) => ({
      ...group,
      sessions: group.sessions.slice(0, 5),
    }))
    .slice(0, 10);
});

// Whether the server full-text results are the visible list
const showingSearchResults = computed(
  () => !!searchQuery.value && searchResults.value.length > 0,
);

// Flatten the VISIBLE list for keyboard navigation. With an active query the
// only navigable list is the server search results (empty while loading or
// when nothing matched); otherwise the grouped recent sessions.
const flattenedItems = computed(() => {
  if (searchQuery.value.trim()) {
    return showingSearchResults.value ? searchResults.value : [];
  }
  const items = [];
  for (const group of groupedSessions.value) {
    for (const session of group.sessions) {
      items.push({
        ...session,
        projectName: group.projectName,
      });
    }
  }
  return items;
});

watch(
  () => props.show,
  (isVisible) => {
    if (isVisible) {
      searchQuery.value = '';
      selectedIndex.value = 0;
      nextTick(() => inputRef.value?.focus());
      document.addEventListener('keydown', handleKeydown);
    } else {
      document.removeEventListener('keydown', handleKeydown);
      clearSearch();
    }
  },
);

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  clearTimeout(searchTimer);
});

watch(flattenedItems, () => {
  selectedIndex.value = 0;
});

function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (selectedIndex.value < flattenedItems.value.length - 1) {
      selectedIndex.value++;
    }
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (selectedIndex.value > 0) selectedIndex.value--;
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    const item = flattenedItems.value[selectedIndex.value];
    if (item) selectSession(item);
  }
}

function selectSession(session) {
  if (!session) return;
  emit('close');
  router.push({
    name: 'chat',
    params: { project: session.projectSlug, session: session.sessionId },
  });
}

function flatIndexOf(session) {
  return flattenedItems.value.findIndex(
    (i) => i.sessionId === session.sessionId,
  );
}

const formatTime = formatRelativeTime;
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
            v-model="searchQuery"
            type="text"
            class="palette-input"
            placeholder="Search sessions..."
          />
          <kbd class="palette-hint">esc</kbd>
        </div>

        <!-- Full-text search results -->
        <div v-if="showingSearchResults" class="palette-results">
          <div class="palette-section">
            <div class="section-label">Sessions matching "{{ searchQuery }}"</div>
            <div
              v-for="(item, index) in searchResults"
              :key="item.sessionId"
              class="palette-item"
              :class="{ selected: index === selectedIndex }"
              @click="selectSession(item)"
              @mouseenter="selectedIndex = index"
            >
              <span class="item-icon">💬</span>
              <div class="item-content">
                <span class="item-title">{{ item.title || item.sessionId.slice(0, 8) }}</span>
                <span class="item-meta">{{ item.projectName }}</span>
              </div>
              <div v-if="item.snippets?.[0]" class="item-snippet">{{ item.snippets[0] }}</div>
            </div>
            <div v-if="searchTruncated" class="section-note">Showing top results — type more to narrow</div>
          </div>
        </div>

        <!-- Searching indicator -->
        <div v-else-if="searchQuery && searchLoading" class="palette-empty">
          <p>Searching…</p>
        </div>

        <!-- No results -->
        <div v-else-if="searchQuery && !searchLoading && !searchResults.length" class="palette-empty">
          <p>No sessions found</p>
        </div>

        <!-- Recent sessions grouped by project -->
        <div v-else-if="groupedSessions.length > 0" class="palette-results">
          <template v-for="group in groupedSessions" :key="group.projectSlug">
            <div class="palette-group-label">{{ group.projectName }}</div>
            <div
              v-for="session in group.sessions"
              :key="session.sessionId"
              class="palette-item palette-item-session"
              :class="{ selected: flattenedItems[selectedIndex]?.sessionId === session.sessionId }"
              @click="selectSession(session)"
              @mouseenter="selectedIndex = flatIndexOf(session)"
            >
              <div class="palette-item-content">
                <span class="palette-item-title">{{ session.title || session.firstPrompt || 'Untitled' }}</span>
              </div>
              <span class="palette-item-time">{{ formatTime(session.modified) }}</span>
            </div>
          </template>
        </div>

        <div v-else class="palette-empty">
          <p>No recent sessions</p>
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

.palette-group-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 12px 4px;
}

.palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.palette-item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.palette-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.palette-item-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.palette-empty {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* Search results section */
.palette-section {
  display: flex;
  flex-direction: column;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 6px 12px 4px;
}

.item-icon {
  flex-shrink: 0;
  font-size: 14px;
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

.item-meta {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-snippet {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  max-width: 200px;
}

.section-note {
  font-size: 11px;
  color: var(--text-muted);
  padding: 4px 12px 6px;
  font-style: italic;
}
</style>
