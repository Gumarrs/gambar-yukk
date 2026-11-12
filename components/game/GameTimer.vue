<script setup lang="ts">
const props = defineProps<{ seconds: number; total: number }>()
const urgent = computed(() => props.seconds <= 10)
const pct = computed(() => Math.min(100, Math.max(0, (props.seconds / Math.max(1, props.total)) * 100)))
</script>

<template>
  <div class="min-w-[150px]" role="timer" :aria-label="`Sisa waktu ${seconds} detik`">
    <p
      class="text-center font-display text-4xl font-bold tabular-nums"
      :class="urgent ? 'animate-wiggle text-coral' : ''"
    >
      ⏱ {{ formatClock(seconds) }}
    </p>
    <div class="mt-1 h-3 overflow-hidden rounded-full border-[3px] border-ink bg-white">
      <div
        class="h-full transition-all duration-500"
        :class="urgent ? 'bg-coral' : 'bg-mint'"
        :style="{ width: `${pct}%` }"
      />
    </div>
  </div>
</template>
