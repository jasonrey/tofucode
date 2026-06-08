<script setup>
import { computed } from 'vue';
import { claudeUrl } from '../utils/slug.js';

const props = defineProps({
  // Live session entry from rc:list (or null/undefined)
  live: {
    type: Object,
    default: null,
  },
  // Optional text label; icon-only when empty
  label: {
    type: String,
    default: '',
  },
});

// Only meaningful when the RC bridge is connected
const visible = computed(
  () => !!(props.live?.rcActive && props.live?.bridgeSessionId),
);
</script>

<template>
  <a
    v-if="visible"
    class="rc-claude-link"
    :class="{ labeled: label }"
    :href="claudeUrl(live.bridgeSessionId)"
    target="_blank"
    rel="noopener"
    title="Open in claude.ai"
    @click.stop
  >
    <template v-if="label">{{ label }}</template>
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
    </svg>
  </a>
</template>

<style scoped>
.rc-claude-link {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  color: var(--success-color);
  text-decoration: none;
  transition: background 0.15s;
}

.rc-claude-link:hover {
  background: var(--bg-tertiary);
}

/* Labeled variant — text button (e.g. ChatView banner) */
.rc-claude-link.labeled {
  width: auto;
  height: auto;
  gap: 4px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.rc-claude-link.labeled:hover {
  background: rgba(34, 197, 94, 0.1);
}
</style>
