<script setup lang="ts">
withDefaults(defineProps<{ label?: string; fullscreen?: boolean }>(), { label: 'Memuat…', fullscreen: true })
</script>

<template>
  <div class="grid place-items-center p-8" :class="fullscreen ? 'min-h-screen' : 'min-h-[200px]'">
    <div class="text-center">
      <div class="mb-4 flex justify-center gap-2" aria-hidden="true">
        <span class="h-4 w-4 animate-floaty rounded-full bg-coral" />
        <span class="h-4 w-4 animate-floaty rounded-full bg-sun [animation-delay:.2s]" />
        <span class="h-4 w-4 animate-floaty rounded-full bg-sky [animation-delay:.4s]" />
      </div>
      <p class="font-display text-xl font-semibold">{{ label }}</p>
    </div>
  </div>
</template>
