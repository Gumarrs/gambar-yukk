<script setup lang="ts">
const props = defineProps<{ code: string }>()
const copied = ref<'code' | 'link' | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

async function copy(what: 'code' | 'link') {
  const text = what === 'code' ? props.code : `${window.location.origin}/?join=${props.code}`
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (copied.value = null), 1800)
  } catch {
    /* clipboard blocked: the code is still visible on screen */
  }
}
onBeforeUnmount(() => timer && clearTimeout(timer))
</script>

<template>
  <div class="sticker p-5 text-center">
    <p class="font-display text-sm font-semibold uppercase tracking-widest text-ink/60">Kode room</p>
    <p class="my-1 font-display text-5xl font-bold tracking-[0.25em] sm:text-6xl">{{ code }}</p>
    <div class="mt-3 flex flex-wrap justify-center gap-2">
      <AppButton variant="secondary" class="!px-4 !py-2 !text-base" @click="copy('code')">
        {{ copied === 'code' ? '✅ Tersalin!' : '📋 Salin kode' }}
      </AppButton>
      <AppButton variant="secondary" class="!px-4 !py-2 !text-base" @click="copy('link')">
        {{ copied === 'link' ? '✅ Tersalin!' : '🔗 Salin tautan' }}
      </AppButton>
    </div>
  </div>
</template>
