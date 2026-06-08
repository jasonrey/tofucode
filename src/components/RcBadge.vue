<template>
  <span class="rc-badge" :class="badgeClass">{{ label }}</span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  entrypoint: String,
  status: String,
  rcActive: Boolean,
});

const badgeClass = computed(() => {
  if (props.entrypoint === 'sdk-ts' || props.entrypoint === 'sdk-js')
    return 'badge-sdk';
  if (props.rcActive) return 'badge-active';
  if (props.status === 'busy') return 'badge-busy';
  return 'badge-idle';
});

const label = computed(() => {
  if (props.entrypoint === 'sdk-ts' || props.entrypoint === 'sdk-js')
    return 'SDK';
  if (props.rcActive) return '● live';
  return props.status === 'busy' ? '● busy' : 'idle';
});
</script>

<style scoped>
.rc-badge {
  display: inline-block;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 500;
  white-space: nowrap;
}

.badge-active {
  color: var(--success-color);
  background: color-mix(in srgb, var(--success-color) 12%, transparent);
}

.badge-busy {
  color: var(--warning-color);
  background: color-mix(in srgb, var(--warning-color) 12%, transparent);
}

.badge-idle {
  color: var(--text-muted);
  background: var(--bg-tertiary);
}

.badge-sdk {
  color: var(--text-secondary);
  background: var(--bg-tertiary);
}
</style>
