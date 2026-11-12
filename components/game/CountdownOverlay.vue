<script setup lang="ts">
defineProps<{ seconds: number }>()
</script>

<template>
  <div class="grid min-h-[50vh] place-items-center text-center" aria-live="assertive">
    <div>
      <p class="mb-2 font-display text-2xl font-semibold">Siap-siap menggambar…</p>
      <p
        :key="seconds"
        class="animate-pop font-display text-[9rem] font-bold leading-none text-coral sm:text-[12rem]"
        style="text-shadow: 6px 6px 0 #2b2d42"
      >
        {{ seconds > 0 ? seconds : 'Mulai!' }}
      </p>
    </div>
  </div>
</template>
