<template>
  <div class="rc-controls">
    <template v-if="liveEntry">
      <button class="btn-stop" :disabled="pending" @click="stop">
        {{ pending ? 'Stopping…' : 'Stop' }}
      </button>
      <RcBadge :entrypoint="liveEntry.entrypoint" :status="liveEntry.status" :rc-active="liveEntry.rcActive" />
    </template>
    <template v-else>
      <button class="btn-start" :disabled="pending" @click="start">
        {{ pending ? 'Starting…' : 'Start in Claude app' }}
      </button>
    </template>
    <div v-if="errorMsg" class="rc-error">{{ errorMsg }}</div>
    <div v-if="confirmFallback" class="rc-confirm">
      Session history not found. Start a new session?
      <button @click="startNew">Yes, start new</button>
      <button @click="confirmFallback = false">Cancel</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useWebSocket } from '../composables/useWebSocket';
import RcBadge from './RcBadge.vue';

const props = defineProps({
  sessionId: String,
  projectSlug: String,
});

const { liveBySessionId, startRcSession, stopRcSession } = useWebSocket();

const pending = ref(false);
const errorMsg = ref('');
const confirmFallback = ref(false);

const liveEntry = computed(
  () => liveBySessionId.value[props.sessionId] ?? null,
);

async function start() {
  pending.value = true;
  errorMsg.value = '';
  try {
    const result = await startRcSession({
      projectSlug: props.projectSlug,
      sessionId: props.sessionId,
      allowFallbackToNew: false,
    });
    if (
      result.status === 'failed' &&
      result.message?.includes('JSONL not found')
    ) {
      confirmFallback.value = true;
    } else if (result.status === 'failed') {
      errorMsg.value = result.message || 'Failed to start';
    }
  } catch {
    errorMsg.value = 'Request timed out';
  } finally {
    pending.value = false;
  }
}

async function startNew() {
  confirmFallback.value = false;
  pending.value = true;
  errorMsg.value = '';
  try {
    const result = await startRcSession({
      projectSlug: props.projectSlug,
      sessionId: props.sessionId,
      allowFallbackToNew: true,
    });
    if (result.status === 'failed') {
      errorMsg.value = result.message || 'Failed to start';
    }
  } catch {
    errorMsg.value = 'Request timed out';
  } finally {
    pending.value = false;
  }
}

async function stop() {
  pending.value = true;
  errorMsg.value = '';
  try {
    await stopRcSession({ sessionId: props.sessionId });
  } catch {
    errorMsg.value = 'Request timed out';
  } finally {
    pending.value = false;
  }
}
</script>

<style scoped>
.rc-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.btn-start, .btn-stop {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s;
}
.btn-start:hover { background: var(--bg-hover); }
.btn-stop { border-color: var(--error-color); color: var(--error-color); }
.btn-stop:hover { background: color-mix(in srgb, var(--error-color) 12%, transparent); }
.btn-start:disabled, .btn-stop:disabled { opacity: 0.5; cursor: not-allowed; }
.rc-error { font-size: 11px; color: var(--error-color); }
.rc-confirm { font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; }
.rc-confirm button { font-size: 11px; padding: 2px 6px; border-radius: 3px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); cursor: pointer; }
</style>
