<script setup lang="ts">
import type { ResultDrawing, RoundResults } from '~/types/game'

const props = defineProps<{
  results: RoundResults
  meId: string
  canStartNext?: boolean
  starting?: boolean
  waitingText?: string
  /** True after the last round of a game. */
  gameOver?: boolean
  roundLabel?: string
}>()
const emit = defineEmits<{ next: []; refreshUrls: [] }>()

const zoomed = ref<ResultDrawing | null>(null)

// Collage sharing: build once, preview, then share/download from a fresh click.
const building = ref(false)
const collageBlob = shallowRef<Blob | null>(null)
const collageUrl = ref<string | null>(null)
const collageMsg = ref<string | null>(null)

function closeCollage() {
  if (collageUrl.value) URL.revokeObjectURL(collageUrl.value)
  collageUrl.value = null
  collageBlob.value = null
}

async function makeCollage() {
  building.value = true
  collageMsg.value = null
  try {
    const blob = await buildCollage(props.results)
    closeCollage()
    collageBlob.value = blob
    collageUrl.value = URL.createObjectURL(blob)
  } catch {
    collageMsg.value = 'Kolase gagal dibuat. Coba lagi ya.'
  } finally {
    building.value = false
  }
}

async function shareIt() {
  if (!collageBlob.value) return
  const out = await shareCollage(collageBlob.value, `Hasil gambar ronde ${props.results.round_number} di Gambar Bareng!`)
  collageMsg.value = out === 'downloaded' ? 'Kolase diunduh. Silakan unggah ke medsos favoritmu!' : null
}

function downloadIt() {
  if (collageBlob.value) downloadBlob(collageBlob.value, 'gambar-bareng.png')
}

onBeforeUnmount(closeCollage)
</script>

<template>
  <div>
    <div class="mb-6 text-center">
      <p class="font-display text-lg font-semibold text-ink/60">{{ roundLabel ?? `Ronde ${results.round_number}` }}</p>
      <p v-if="gameOver" class="mx-auto mb-2 w-fit rounded-full border-[3px] border-ink bg-sun px-4 py-1 font-display text-lg font-bold">
        🏁 Itu ronde terakhir. Game selesai!
      </p>
      <h2 class="text-4xl font-bold sm:text-5xl">Hasil gambar kalian! 🎉</h2>
      <div class="mt-4">
        <AppButton variant="secondary" :loading="building" @click="makeCollage">📸 Bagikan kolase</AppButton>
        <p v-if="collageMsg && !collageUrl" class="mt-2 font-bold text-coral">{{ collageMsg }}</p>
      </div>
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
      <AppButton :loading="starting" class="!px-8 !py-4 !text-2xl" @click="emit('next')">
        {{ gameOver ? '🔁 Main lagi dari awal' : '🎨 Ronde berikutnya' }}
      </AppButton>
    </div>
    <p v-else-if="waitingText" class="mt-8 text-center font-display text-lg font-semibold text-ink/60">
      {{ waitingText }}
    </p>

    <AppModal :open="!!collageUrl" title="Kolase hasil gambar" @close="closeCollage">
      <div class="max-h-[60vh] overflow-auto rounded-xl border-[3px] border-ink">
        <img v-if="collageUrl" :src="collageUrl" alt="Kolase hasil gambar" class="w-full" />
      </div>
      <p v-if="collageMsg" class="mt-3 font-bold text-ink/70">{{ collageMsg }}</p>
      <template #footer>
        <AppButton variant="ghost" @click="closeCollage">Tutup</AppButton>
        <AppButton variant="secondary" @click="downloadIt">⬇️ Unduh</AppButton>
        <AppButton @click="shareIt">📤 Bagikan</AppButton>
      </template>
    </AppModal>

    <AppModal :open="!!zoomed" :title="zoomed?.player_name" @close="zoomed = null">
      <img v-if="zoomed?.drawing_url" :src="zoomed.drawing_url" :alt="`Gambar oleh ${zoomed.player_name}`" class="w-full rounded-xl border-[3px] border-ink" />
      <template #footer>
        <AppButton variant="secondary" @click="zoomed = null">Tutup</AppButton>
      </template>
    </AppModal>
  </div>
</template>
