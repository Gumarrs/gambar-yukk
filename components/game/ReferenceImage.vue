<script setup lang="ts">
import type { PromptInfo } from '~/types/game'

const props = defineProps<{ prompt: PromptInfo | null }>()
const failed = ref(false)
watch(
  () => props.prompt?.image_url,
  () => (failed.value = false)
)
</script>

<template>
  <div class="sticker overflow-hidden">
    <div class="border-b-[3px] border-ink bg-grape px-4 py-2 text-white">
      <p class="font-display text-sm font-semibold uppercase tracking-widest opacity-80">Gambar referensi</p>
      <p class="font-display text-2xl font-bold">{{ prompt?.title ?? '…' }}</p>
    </div>
    <div class="grid aspect-[4/3] place-items-center bg-cream">
      <img
        v-if="prompt?.image_url && !failed"
        :src="prompt.image_url"
        :alt="`Referensi: ${prompt.title}`"
        class="h-full w-full object-contain"
        @error="failed = true"
      />
      <p v-else class="px-6 text-center font-display text-xl font-semibold text-ink/50">
        {{ prompt ? `Gambarnya gagal dimuat. Gambar saja: ${prompt.title}!` : 'Menunggu gambar…' }}
      </p>
    </div>
    <p v-if="prompt?.category" class="border-t-[3px] border-ink px-4 py-2 text-sm font-extrabold">
      Kategori: {{ prompt.category }}
    </p>
  </div>
</template>
