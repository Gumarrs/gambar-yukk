<script setup lang="ts">
defineProps<{ message: string | null }>()
const emit = defineEmits<{ dismiss: [] }>()
</script>

<template>
  <div
    v-if="message"
    role="alert"
    class="flex items-start gap-3 rounded-2xl border-[3px] border-ink bg-coral px-4 py-3 font-bold text-white"
  >
    <span aria-hidden="true">⚠️</span>
    <p class="flex-1">{{ message }}</p>
    <button type="button" class="font-display text-lg leading-none" aria-label="Tutup pesan" @click="emit('dismiss')">
      ✕
    </button>
  </div>
</template>
