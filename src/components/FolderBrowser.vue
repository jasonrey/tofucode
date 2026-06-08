<script setup>
import { computed, nextTick, onUnmounted, ref } from 'vue';
import { useWebSocket } from '../composables/useWebSocket';

const props = defineProps({
  // Label for the primary action on the current folder
  selectLabel: {
    type: String,
    default: 'Open',
  },
  // Show the "new folder here" create form in the footer
  allowCreate: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['select-folder', 'created']);

const {
  browseFolder,
  folderContents,
  currentFolder,
  homePath,
  rootPath,
  createProject,
  onMessage,
} = useWebSocket();

// Directories only, dotfiles hidden, sorted alpha
const folders = computed(() => {
  const items = folderContents.value || [];
  return items
    .filter((item) => item.isDirectory && !item.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));
});

// Topmost browsable directory — rootPath when restricted, else home
const topPath = computed(() => rootPath.value || homePath.value || '/');

const atTop = computed(() => {
  const current = currentFolder.value;
  return !current || current === '/' || current === topPath.value;
});

// Breadcrumb segments relative to topPath
const breadcrumb = computed(() => {
  const current = currentFolder.value;
  if (!current) return [];
  const top = topPath.value;
  const segments = [
    { label: top === '/' ? '/' : top.split('/').pop(), path: top },
  ];
  if (current === top) return segments;
  const rest = current.startsWith(`${top}/`)
    ? current.slice(top.length + 1)
    : current.replace(/^\//, '');
  let acc = top === '/' ? '' : top;
  for (const part of rest.split('/').filter(Boolean)) {
    acc = `${acc}/${part}`;
    segments.push({ label: part, path: acc });
  }
  return segments;
});

function goUp() {
  if (atTop.value) return;
  const parent = currentFolder.value.split('/').slice(0, -1).join('/') || '/';
  browseFolder(parent);
}

function enterFolder(path) {
  browseFolder(path);
}

function selectCurrent() {
  if (currentFolder.value) {
    emit('select-folder', currentFolder.value);
  }
}

// ── Create new directory in current folder ──────────────────
const creating = ref(false);
const createPending = ref(false); // in-flight guard against double-submit
const newName = ref('');
const createError = ref('');
const nameInputRef = ref(null);

function startCreating() {
  creating.value = true;
  newName.value = '';
  createError.value = '';
  nextTick(() => nameInputRef.value?.focus());
}

function cancelCreating() {
  creating.value = false;
  createPending.value = false;
  newName.value = '';
  createError.value = '';
}

function confirmCreate() {
  const name = newName.value.trim();
  if (!name || !currentFolder.value || createPending.value) return;
  createPending.value = true;
  createError.value = '';
  createProject(currentFolder.value, name);
}

const unsubCreate = onMessage((msg) => {
  if (msg.type !== 'project:create:result' || !props.allowCreate) return;
  createPending.value = false;
  if (msg.status === 'ok') {
    cancelCreating();
    emit('created', msg.projectSlug);
  } else {
    createError.value = msg.message || 'Failed to create folder';
  }
});
onUnmounted(() => unsubCreate());
</script>

<template>
  <div class="folder-browser">
    <!-- Breadcrumb bar -->
    <div class="browser-bar">
      <button class="up-btn" :disabled="atTop" title="Go up" @click="goUp">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <nav class="breadcrumb">
        <template v-for="(seg, i) in breadcrumb" :key="seg.path">
          <span v-if="i > 0" class="crumb-sep">/</span>
          <button
            class="crumb"
            :class="{ current: i === breadcrumb.length - 1 }"
            @click="enterFolder(seg.path)"
          >{{ seg.label }}</button>
        </template>
      </nav>
      <button class="select-btn" @click="selectCurrent">
        {{ selectLabel }}
      </button>
    </div>

    <!-- Directory listing — click drills into the folder -->
    <div class="folder-list">
      <div
        v-for="item in folders"
        :key="item.path"
        class="folder-row"
        @click="enterFolder(item.path)"
      >
        <svg class="folder-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="folder-name">{{ item.name }}</span>
        <svg class="folder-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
      <div v-if="folders.length === 0" class="folder-empty">
        <p>No subdirectories</p>
      </div>
    </div>

    <!-- Create new directory in current folder -->
    <div v-if="allowCreate" class="browser-footer">
      <form v-if="creating" class="create-form" @submit.prevent="confirmCreate">
        <input
          ref="nameInputRef"
          v-model="newName"
          type="text"
          class="create-input"
          placeholder="folder-name"
          @keydown.escape.stop.prevent="cancelCreating"
        />
        <button type="submit" class="create-btn" :disabled="!newName.trim() || createPending">
          {{ createPending ? 'Creating…' : 'Create' }}
        </button>
        <button type="button" class="create-btn cancel" @click="cancelCreating">Cancel</button>
      </form>
      <button v-else class="new-folder-btn" @click="startCreating">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          <line x1="12" y1="11" x2="12" y2="17"/>
          <line x1="9" y1="14" x2="15" y2="14"/>
        </svg>
        New folder here
      </button>
      <span v-if="createError" class="create-error">{{ createError }}</span>
    </div>
  </div>
</template>

<style scoped>
.folder-browser {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.browser-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.up-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}

.up-btn:hover:not(:disabled) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.up-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.breadcrumb {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  white-space: nowrap;
}

.breadcrumb::-webkit-scrollbar {
  display: none;
}

.crumb {
  padding: 2px 4px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.15s;
}

.crumb:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.crumb.current {
  color: var(--text-primary);
  font-weight: 500;
}

.crumb-sep {
  color: var(--text-muted);
  font-size: 12px;
}

.select-btn {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.15s;
}

.select-btn:hover {
  background: var(--bg-hover);
  border-color: var(--text-muted);
}

.folder-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  min-height: 0;
}

.folder-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.1s;
}

.folder-row:hover {
  background: var(--bg-hover);
}

.folder-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.folder-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-arrow {
  flex-shrink: 0;
  color: var(--text-muted);
}

.folder-empty {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* Create-folder footer */
.browser-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.new-folder-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}

.new-folder-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.create-form {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.create-input {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  font-size: 12px;
  font-family: var(--font-mono);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
}

.create-input:focus {
  outline: none;
  border-color: var(--text-muted);
}

.create-btn {
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  white-space: nowrap;
}

.create-btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.create-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.create-btn.cancel {
  background: transparent;
  color: var(--text-muted);
}

.create-btn.cancel:hover {
  color: var(--text-primary);
}

.create-error {
  font-size: 11px;
  color: var(--error-color);
  width: 100%;
}
</style>
