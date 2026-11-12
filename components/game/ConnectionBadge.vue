<script setup lang="ts">
import type { RealtimeStatus } from '~/composables/useRealtimeRoom'

const props = defineProps<{ status: RealtimeStatus; degraded?: boolean }>()

const view = computed(() => {
  if (props.status === 'disconnected' || props.degraded) return { dot: 'bg-coral', text: 'Menyambung ulang…' }
  if (props.status === 'connected') return { dot: 'bg-mint', text: 'Terhubung' }
  return { dot: 'bg-sun', text: 'Menghubungkan…' }
})
</script>

<template>
  <span
    class="inline-flex items-center gap-2 rounded-full border-[3px] border-ink bg-white px-3 py-1 text-sm font-extrabold"
  >
    <span class="h-3 w-3 rounded-full" :class="view.dot" />
    {{ view.text }}
  </span>
</template>
