<script setup>
import { useApi } from '../composables/useApi';

const { liveSessions } = useApi();
</script>

<template>
  <nav class="tab-bar">
    <div class="tab-bar-inner">
      <router-link :to="{ name: 'home' }" class="tab-item">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="tab-label">Folders</span>
      </router-link>

      <router-link :to="{ name: 'recent' }" class="tab-item">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 7v5l3 2"/>
        </svg>
        <span class="tab-label">Recent</span>
      </router-link>

      <router-link :to="{ name: 'live' }" class="tab-item">
        <span class="tab-icon-wrap">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2 4 14h7l-1 8 9-12h-7z"/>
          </svg>
          <span v-if="liveSessions.length" class="tab-count">{{ liveSessions.length }}</span>
        </span>
        <span class="tab-label">Live</span>
      </router-link>

      <router-link :to="{ name: 'settings' }" class="tab-item">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span class="tab-label">Settings</span>
      </router-link>
    </div>
  </nav>
</template>

<style scoped>
.tab-bar {
  flex-shrink: 0;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  /* iOS standalone PWA uses a translucent status bar — reserve the home indicator */
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.tab-bar-inner {
  display: flex;
  align-items: stretch;
  height: var(--tabbar-height);
  max-width: 560px;
  margin: 0 auto;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.tab-item:hover {
  color: var(--text-secondary);
}

/* Only the four tab roots activate — SessionsView/ChatView highlight nothing */
.tab-item.router-link-exact-active {
  color: var(--text-primary);
}

.tab-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.tab-icon-wrap {
  position: relative;
  display: flex;
}

.tab-count {
  position: absolute;
  top: -4px;
  right: -8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 8px;
  background: rgba(34, 197, 94, 0.15);
  color: var(--success-color);
}
</style>
