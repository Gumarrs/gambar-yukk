<script setup lang="ts">
import type { ResultDrawing, RoundResults } from '~/types/game'

defineProps<{
  results: RoundResults
  meId: string
  canStartNext?: boolean
  starting?: boolean
  waitingText?: string
}>()
const emit = defineEmits<{ next: []; refreshUrls: [] }>()

const zoomed = ref<ResultDrawing | null>(null)
</script>

<template>
  <div>
    <div class="mb-6 text-center">
      <p class="font-display text-lg font-semibold text-ink/60">Ronde {{ results.round_number }}</p>
      <h2 class="text-4xl font-bold sm:text-5xl">Hasil gambar kalian! 🎉</h2>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
      <div class="lg:sticky lg:top-24 lg:self-start">
        <ReferenceImage :prompt="results.prompt" />
      </div>

      <div>
        <div v-if="results.drawings.length" class="grid gap-5 sm:grid-cols-2">
          <article v-for="d in results.drawings" :key="d.player_id" class="sticker animate-pop overflow-hidden">
            <header class="flex items-center gap-3 border-b-[3px] border-ink bg-cream px-4 py-3">
              <AvatarBubble :avatar-key="d.avatar_key" :size="40" />
              <p class="min-w-0 flex-1 truncate font-display text-xl font-bold">
                {{ d.player_name }}
                <span v-if="d.player_id === meId" class="ml-1 text-sm text-sky">(kamu)</span>
              </p>
            </header>

            <button
              v-if="d.drawing_url"
              type="button"
              class="block aspect-[3/2] w-full bg-white"
              :aria-label="`Perbesar gambar ${d.player_name}`"
              @click="zoomed = d"
            >
              <img
                :src="d.drawing_url"
                :alt="`Gambar oleh ${d.player_name}`"
                class="h-full w-full object-contain"
                loading="lazy"
                @error="emit('refreshUrls')"
              />
            </button>
            <div v-else class="grid aspect-[3/2] place-items-center bg-ink/5 p-4 text-center">
              <div>
                <p class="text-5xl" aria-hidden="true">⏰</p>
                <p class="mt-2 font-display text-xl font-semibold text-ink/60">
                  {{
                    d.player_id === meId
                      ? 'Gambarmu belum terkirim. Tekan “Selesai & kirim” sebelum waktu habis ya!'
                      : 'Waktu habis, belum sempat kirim'
                  }}
                </p>
              </div>
            </div>
          </article>
        </div>
        <p v-else class="sticker p-8 text-center font-display text-xl font-semibold text-ink/60">
          Belum ada gambar yang masuk di ronde ini.
        </p>
      </div>
    </div>

    <div v-if="canStartNext" class="mt-8 text-center">
      <AppButton :loading="starting" class="!px-8 !py-4 !text-2xl" @click="emit('next')">🎨 Ronde berikutnya</AppButton>
    </div>
    <p v-else-if="waitingText" class="mt-8 text-center font-display text-lg font-semibold text-ink/60">
      {{ waitingText }}
    </p>

    <AppModal :open="!!zoomed" :title="zoomed?.player_name" @close="zoomed = null">
      <img v-if="zoomed?.drawing_url" :src="zoomed.drawing_url" :alt="`Gambar oleh ${zoomed.player_name}`" class="w-full rounded-xl border-[3px] border-ink" />
      <template #footer>
        <AppButton variant="secondary" @click="zoomed = null">Tutup</AppButton>
      </template>
    </AppModal>
  </div>
</template>
