<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';
import FolderBrowser from '../components/FolderBrowser.vue';
import { useApi } from '../composables/useApi';
import { pathToSlug } from '../utils/slug.js';

const router = useRouter();
const { browseFolder, currentFolder, rootPath } = useApi();

function openFolder(path) {
  router.push({ name: 'sessions', params: { project: pathToSlug(path) } });
}

function onCreated(projectSlug) {
  router.push({ name: 'sessions', params: { project: projectSlug } });
}

onMounted(() => {
  document.title = 'tofucode';
  browseFolder(currentFolder.value || null);
});
</script>

<template>
  <div class="folder-view">
    <AppHeader title="Browse" subtitle="Select a folder to view its sessions" />

    <div class="folder-view-body">
      <!-- Restricted mode indicator -->
      <div v-if="rootPath" class="restricted-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span>Restricted to <code>{{ rootPath }}</code></span>
      </div>

      <FolderBrowser
        select-label="View sessions"
        allow-create
        @select-folder="openFolder"
        @created="onCreated"
      />
    </div>
  </div>
</template>

<style scoped>
.folder-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.folder-view-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
}

.restricted-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  margin: 12px 12px 0;
  font-size: 12px;
  color: var(--warning-color);
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: var(--radius-md);
}

.restricted-banner code {
  font-family: var(--font-mono);
  color: var(--text-secondary);
}
</style>
