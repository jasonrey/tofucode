<script setup>
import { computed, inject } from 'vue';
import { useWebSocket } from '../composables/useWebSocket';

const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  subtitle: {
    type: String,
    default: '',
  },
  // Debug: current in-memory session ID from useChatWebSocket.
  // Only set in ChatView — used to verify the WS filter matches the viewed session.
  debugSession: {
    type: String,
    default: null,
  },
});

const { connectionState } = useWebSocket();

// Sidebar context provided by App.vue — hamburger self-renders when present
const sidebar = inject('sidebar', null);

const connectionLabel = computed(() => {
  switch (connectionState.value) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    default:
      return 'Disconnected';
  }
});
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <button v-if="sidebar" class="hamburger-btn" title="Toggle sidebar (Ctrl+B)" @click="sidebar.toggle()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12h18M3 6h18M3 18h18"/>
        </svg>
      </button>
      <!-- Custom content slot -->
      <slot name="content">
        <!-- Default content: title/subtitle or logo -->
        <div class="header-content" v-if="title || subtitle">
          <h1 class="header-title" v-if="title">{{ title }}</h1>
          <p class="header-subtitle truncate" v-if="subtitle">{{ subtitle }}</p>
        </div>
        <div class="header-logo" v-else>
          <img src="/icons/icon-192.png" alt="tofucode" class="logo-icon" />
        </div>
      </slot>
    </div>
    <div class="header-right">
      <slot name="actions"></slot>
      <div
        class="connection-pill"
        :class="connectionState"
        :title="props.debugSession ? `ws session: ${props.debugSession}` : undefined"
      >
        <span class="connection-dot"></span>
        <span class="connection-label">{{ connectionLabel }}</span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  min-height: 57px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.hamburger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.hamburger-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.header-content {
  flex: 1;
  min-width: 0;
}

.header-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-subtitle {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
}

.header-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: -0.01em;
}

.logo-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
}

.connection-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  transition: background 0.2s, color 0.2s;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--error-color);
  transition: background 0.2s;
}

.connection-pill.connected {
  background: rgba(34, 197, 94, 0.1);
  color: var(--success-color);
}

.connection-pill.connected .connection-dot {
  background: var(--success-color);
}

.connection-pill.connecting {
  background: rgba(245, 158, 11, 0.1);
  color: var(--warning-color);
}

.connection-pill.connecting .connection-dot {
  background: var(--warning-color);
  animation: pulse 1.5s infinite;
}

.connection-pill.disconnected {
  background: rgba(239, 68, 68, 0.1);
  color: var(--error-color);
}

.connection-pill.disconnected .connection-dot {
  background: var(--error-color);
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
