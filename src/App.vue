<script setup>
import { onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import CommandPalette from './components/CommandPalette.vue';
import NewProjectModal from './components/NewProjectModal.vue';
import PwaPrompt from './components/PwaPrompt.vue';
import SettingsModal from './components/SettingsModal.vue';
import Sidebar from './components/Sidebar.vue';
import { useApi } from './composables/useApi';
import { useBackButton } from './composables/useBackButton.js';

const { loadInfo } = useApi();

const route = useRoute();

// ── Settings ────────────────────────────────────────────────
const showSettings = ref(false);
const settingsInitialTab = ref('general');
const settings = ref({ debugMode: false });

function openSettings(tab) {
  settingsInitialTab.value = tab || 'general';
  showSettings.value = true;
}

function closeSettings() {
  showSettings.value = false;
}

useBackButton(showSettings, closeSettings, { mobileOnly: true });

// ── Command palette (search) ────────────────────────────────
const showPalette = ref(false);

function openPalette() {
  showPalette.value = true;
}

function closePalette() {
  showPalette.value = false;
}

// ── New project modal ───────────────────────────────────────
const showNewProject = ref(false);

function openNewProject() {
  showNewProject.value = true;
}

function closeNewProject() {
  showNewProject.value = false;
}

useBackButton(showNewProject, closeNewProject, { mobileOnly: true });

provide('newProject', { open: openNewProject });

// ── Sidebar ─────────────────────────────────────────────────
// Single breakpoint: >1024px = grid column, ≤1024px = overlay
const desktopMq = window.matchMedia('(min-width: 1025px)');
const isDesktop = ref(desktopMq.matches);
function onMqChange(e) {
  isDesktop.value = e.matches;
  if (!e.matches) closeSidebar();
}
desktopMq.addEventListener('change', onMqChange);

const sidebarOpen = ref(
  isDesktop.value ? localStorage.getItem('sidebarOpen') !== 'false' : false,
);

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
  localStorage.setItem('sidebarOpen', String(sidebarOpen.value));
}

function openSidebar() {
  sidebarOpen.value = true;
  localStorage.setItem('sidebarOpen', 'true');
}

function closeSidebar() {
  sidebarOpen.value = false;
  localStorage.setItem('sidebarOpen', 'false');
}

const { consumeSentinel } = useBackButton(sidebarOpen, closeSidebar, {
  mobileOnly: true,
});

// Close overlay sidebar on navigation (mobile/tablet)
watch(route, () => {
  if (!isDesktop.value && sidebarOpen.value) {
    consumeSentinel();
    closeSidebar();
  }
});

provide('sidebar', {
  open: sidebarOpen,
  isDesktop,
  toggle: toggleSidebar,
  openSidebar,
  close: closeSidebar,
});

provide('settings', {
  settings,
  debugMode: () => settings.value.debugMode,
});

// ── Keyboard shortcuts ──────────────────────────────────────
function handleGlobalKeydown(e) {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === 'k') {
    e.preventDefault();
    openPalette();
  } else if (e.key === 'b') {
    e.preventDefault();
    toggleSidebar();
  } else if (e.key === ',') {
    e.preventDefault();
    openSettings('general');
  }
}

const isAuthRoute = () => route.name === 'auth';

onMounted(() => {
  if (!isAuthRoute()) loadInfo();
  document.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown);
  desktopMq.removeEventListener('change', onMqChange);
});
</script>

<template>
  <div class="app" :class="{ 'sidebar-open': sidebarOpen && isDesktop }">
    <Sidebar v-if="route.name !== 'auth'" :open="sidebarOpen" @close="closeSidebar" @open-settings="openSettings" />
    <div class="app-main">
      <router-view />
    </div>
    <CommandPalette :show="showPalette" @close="closePalette" />
    <NewProjectModal :show="showNewProject" @close="closeNewProject" />
    <SettingsModal
      :show="showSettings"
      :settings="settings"
      :initial-tab="settingsInitialTab"
      @close="closeSettings"
    />
    <PwaPrompt />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-columns: 1fr;
  height: 100vh;
  overflow: hidden;
}

.app.sidebar-open {
  grid-template-columns: var(--sidebar-width) 1fr;
}

.app-main {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ≤1024px: sidebar is an overlay (positioned by Sidebar.vue), grid stays single column */
@media (max-width: 1024px) {
  .app.sidebar-open {
    grid-template-columns: 1fr;
  }
}
</style>
