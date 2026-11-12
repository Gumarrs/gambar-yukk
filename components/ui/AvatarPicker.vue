<script setup lang="ts">
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="grid grid-cols-4 gap-3" role="radiogroup" aria-label="Pilih avatar">
    <button
      v-for="a in AVATARS"
      :key="a.key"
      type="button"
      role="radio"
      :aria-checked="model === a.key"
      class="rounded-full p-1 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-sky/50"
      :class="model === a.key ? 'scale-110 bg-ink' : 'hover:scale-105'"
      @click="model = a.key"
    >
      <AvatarBubble :avatar-key="a.key" :size="52" />
    </button>
  </div>
</template>
