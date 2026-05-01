<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

defineProps({
  files: {
    type: Array,
    required: true,
  },
});

const expanded = ref(false);
const route = useRoute();
const router = useRouter();

function toggle() {
  expanded.value = !expanded.value;
}

function openInFiles(path) {
  router.push({
    name: 'chat',
    params: route.params,
    query: { ...route.query, mode: 'files', file: path },
  });
}
</script>

<template>
  <div class="turn-files-summary">
    <div class="summary-header" @click="toggle">
      <!-- heroicons: folder-open outline -->
      <svg class="summary-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"/>
      </svg>
      <span class="summary-label">Files</span>
      <span class="summary-count">{{ files.length }}</span>
      <span class="summary-toggle">{{ expanded ? '▼' : '▶' }}</span>
    </div>

    <div v-if="expanded" class="summary-body">
      <div v-for="f in files" :key="f.path" class="summary-row">
        <span class="op-icons">
          <!-- heroicons: document-text outline (read) -->
          <svg
            v-if="f.ops.includes('read')"
            class="op-icon op-read"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            title="Read"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
          </svg>
          <!-- heroicons: pencil outline (write/edit) -->
          <svg
            v-if="f.ops.includes('write') || f.ops.includes('edit')"
            class="op-icon op-write"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            title="Write/Edit"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"/>
          </svg>
        </span>

        <code class="file-path">{{ f.path }}</code>
        <span v-if="f.count > 1" class="file-count">×{{ f.count }}</span>

        <!-- heroicons: arrow-top-right-on-square outline (open in files) -->
        <button class="file-link-btn" @click.stop="openInFiles(f.path)" title="Open in Files tab">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.turn-files-summary {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-size: 12px;
}

.summary-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.summary-header:hover {
  background: var(--bg-hover);
}

.summary-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.summary-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.summary-count {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  color: var(--text-muted);
}

.summary-toggle {
  font-size: 9px;
  color: var(--text-muted);
  margin-left: auto;
}

.summary-body {
  border-top: 1px solid var(--border-color);
  padding: 4px 0;
}

.summary-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  transition: background 0.1s;
}

.summary-row:hover {
  background: var(--bg-hover);
}

.op-icons {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.op-icon {
  flex-shrink: 0;
}

.op-read {
  color: var(--text-muted);
}

.op-write {
  color: #60a5fa;
}

.file-path {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.file-count {
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
  font-family: var(--font-mono);
}

.file-link-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 3px;
  color: var(--text-muted);
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
  cursor: pointer;
}

.summary-row:hover .file-link-btn {
  opacity: 0.7;
}

.file-link-btn:hover {
  opacity: 1 !important;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
}
</style>
