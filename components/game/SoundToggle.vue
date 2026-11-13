<script setup lang="ts">
const { muted, toggleMute } = useSound()
</script>

<template>
  <button
    type="button"
    class="grid h-10 w-10 place-items-center rounded-full border-[3px] border-ink bg-white text-xl transition hover:scale-105"
    :aria-label="muted ? 'Nyalakan suara' : 'Matikan suara'"
    :aria-pressed="!muted"
    @click="toggleMute"
  >
    {{ muted ? '🔇' : '🔊' }}
  </button>
</template>
