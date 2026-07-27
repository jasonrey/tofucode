<script setup>
import { computed, onMounted, onUnmounted, provide, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CommandPalette from './components/CommandPalette.vue';
import PwaPrompt from './components/PwaPrompt.vue';
import TabBar from './components/TabBar.vue';
import { useApi } from './composables/useApi';
import { useBackButton } from './composables/useBackButton.js';

const { loadInfo, getProjects } = useApi();

const route = useRoute();
const router = useRouter();

// ── Command palette (full-text session search) ──────────────
const showPalette = ref(false);

function openPalette() {
  showPalette.value = true;
}

function closePalette() {
  showPalette.value = false;
}

const { consumeSentinel } = useBackButton(showPalette, closePalette, {
  mobileOnly: true,
});

// The palette emits its target instead of pushing itself: the back-button
// sentinel must be consumed here first, otherwise the history.back() that
// closes the overlay races with — and cancels — the pending navigation.
function navigateFromPalette(to) {
  consumeSentinel();
  showPalette.value = false;
  router.push(to);
}

// Views without a keyboard (mobile) reach search through this.
provide('palette', { open: openPalette });

// ── Keyboard shortcuts ──────────────────────────────────────
function handleGlobalKeydown(e) {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === 'k') {
    e.preventDefault();
    openPalette();
  }
}

const isAuthRoute = () => route.name === 'auth';
const showTabBar = computed(() => !isAuthRoute());

onMounted(() => {
  if (!isAuthRoute()) {
    loadInfo();
    // Warms the folder list that LiveView's name lookup and the Recent tab
    // both read, so a cold deep-link to either resolves names immediately.
    getProjects();
  }
  document.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <div class="app" :class="{ 'has-tabbar': showTabBar }">
    <div class="app-main">
      <router-view />
    </div>
    <TabBar v-if="showTabBar" />
    <CommandPalette :show="showPalette" @close="closePalette" @navigate="navigateFromPalette" />
    <PwaPrompt />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: 1fr auto;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  /* How much fixed chrome sits at the bottom — read by overlays like PwaPrompt
     so they clear the tab bar, and collapse to 0 on /auth where it's absent. */
  --chrome-bottom: 0px;
}

.app.has-tabbar {
  --chrome-bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px));
}

.app-main {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
