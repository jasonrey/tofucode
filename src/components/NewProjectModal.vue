<script setup>
import { onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useApi } from '../composables/useApi';
import { pathToSlug } from '../utils/slug.js';
import FolderBrowser from './FolderBrowser.vue';

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close']);

const router = useRouter();
const { browseFolder, currentFolder } = useApi();

// Pick an existing folder → navigate to its session list (no auto session start)
function selectFolder(path) {
  emit('close');
  router.push({ name: 'sessions', params: { project: pathToSlug(path) } });
}

// New directory created via FolderBrowser → navigate to the server-provided slug
function onCreated(projectSlug) {
  emit('close');
  router.push({ name: 'sessions', params: { project: projectSlug } });
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  }
}

watch(
  () => props.show,
  (isVisible) => {
    if (isVisible) {
      browseFolder(currentFolder.value || null);
      document.addEventListener('keydown', handleKeydown);
    } else {
      document.removeEventListener('keydown', handleKeydown);
    }
  },
);
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <Teleport to="body">
    <!-- v-show keeps FolderBrowser mounted so an in-flight create still resolves -->
    <div v-show="show" class="modal-overlay" @click="$emit('close')">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h2 class="modal-title">New project</h2>
          <button class="modal-close" title="Close" @click="$emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <FolderBrowser
          select-label="Use this folder"
          allow-create
          @select-folder="selectFolder"
          @created="onCreated"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  z-index: 1000;
}

.modal {
  width: 100%;
  max-width: 480px;
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

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.modal-title {
  font-size: 14px;
  font-weight: 600;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  transition: all 0.15s;
}

.modal-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
