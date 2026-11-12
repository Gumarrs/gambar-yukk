<script setup lang="ts">
const props = withDefaults(defineProps<{ avatarKey?: string | null; size?: number }>(), { size: 56 })
const avatar = computed(() => avatarFor(props.avatarKey))
</script>

<template>
  <span
    class="inline-flex shrink-0 select-none items-center justify-center rounded-full border-[3px] border-ink"
    :style="{ width: `${size}px`, height: `${size}px`, background: avatar.bg, fontSize: `${size * 0.52}px` }"
    aria-hidden="true"
  >
    {{ avatar.emoji }}
  </span>
</template>
