<script setup>
import { formatRelativeTime } from '../utils/format.js';
import RcBadge from './RcBadge.vue';
import RcClaudeLink from './RcClaudeLink.vue';

defineProps({
  group: {
    type: Object,
    required: true,
  },
  // Lazily-loaded session list for this project (empty until expanded).
  sessions: {
    type: Array,
    default: () => [],
  },
  // True while this project's sessions are being fetched.
  loading: {
    type: Boolean,
    default: false,
  },
  expanded: {
    type: Boolean,
    default: false,
  },
  liveBySessionId: {
    type: Object,
    default: () => ({}),
  },
  starting: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['toggle', 'new-session', 'open-session', 'view-all']);
</script>

<template>
  <li class="project-group">
    <!-- Project header row -->
    <div class="group-header" @click="emit('toggle')">
      <svg
        class="group-caret"
        :class="{ expanded }"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <path d="M9 18l6-6-6-6"/>
      </svg>
      <span class="group-name truncate">{{ group.name }}</span>
      <span class="group-meta">{{ group.sessionCount }}</span>
      <button
        class="group-new-btn"
        :disabled="starting"
        title="New session"
        @click.stop="emit('new-session')"
      >
        <svg v-if="!starting" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <svg v-else class="spin" width="12" height="12" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Sessions under this project (lazy-loaded on expand) -->
    <ul v-if="expanded" class="group-sessions">
      <li v-if="loading && !sessions.length" class="session-loading">
        <svg class="spin" width="12" height="12" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
        </svg>
        <span>Loading…</span>
      </li>
      <li
        v-for="session in sessions"
        :key="session.sessionId"
        class="session-row"
        @click="emit('open-session', session)"
      >
        <span class="session-title truncate">
          {{ session.title || session.firstPrompt || 'Untitled' }}
        </span>
        <RcClaudeLink :live="liveBySessionId[session.sessionId]" />
        <template v-if="liveBySessionId[session.sessionId]">
          <RcBadge
            :entrypoint="liveBySessionId[session.sessionId].entrypoint"
            :status="liveBySessionId[session.sessionId].status"
            :rc-active="liveBySessionId[session.sessionId].rcActive"
          />
          <code class="session-id-short">{{ session.sessionId.slice(0, 8) }}</code>
        </template>
        <span v-else class="session-time">{{ formatRelativeTime(session.modified) }}</span>
      </li>
      <li class="view-all-row" @click="emit('view-all')">
        View all →
      </li>
    </ul>
  </li>
</template>

<style scoped>
.project-group {
  list-style: none;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.1s;
}

.group-header:hover {
  background: var(--bg-hover);
}

.group-caret {
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform 0.15s;
}

.group-caret.expanded {
  transform: rotate(90deg);
}

.group-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.group-meta {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.group-new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}

.group-new-btn:hover:not(:disabled) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.group-new-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.group-sessions {
  list-style: none;
  margin: 0;
  padding: 0 0 4px;
}

.session-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px 9px 32px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.1s;
}

.session-row:hover {
  background: var(--bg-hover);
}

.session-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.session-time {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
}

.session-id-short {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
}

.session-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px 9px 32px;
  font-size: 12px;
  color: var(--text-muted);
}

.view-all-row {
  padding: 8px 12px 8px 32px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all 0.1s;
}

.view-all-row:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
</style>
