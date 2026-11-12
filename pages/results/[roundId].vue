<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { session, load, validate } = useGuestSession()
const game = useGameRound()
const { results, resultsLoading, resultsError } = game

const roundId = computed(() => String(route.params.roundId ?? ''))
const ready = ref(false)
const fatal = ref<string | null>(null)

onMounted(async () => {
  if (!load()) return void (await router.replace('/'))
  try {
    if ((await validate()) !== 'ok') return void (await router.replace('/'))
    await game.loadResults(roundId.value)
    ready.value = true
  } catch (e) {
    fatal.value = toApiError(e).message
    ready.value = true
  }
})
</script>

<template>
  <LoadingState v-if="!ready" label="Mengambil hasil…" />
  <main v-else class="mx-auto max-w-6xl px-4 py-8">
    <div class="mb-4 flex justify-between">
      <AppButton variant="secondary" @click="router.push(session ? `/room/${session.room_code}` : '/')">
        ← Kembali ke room
      </AppButton>
    </div>
    <ErrorBanner :message="fatal ?? resultsError" />
    <LoadingState v-if="resultsLoading && !results" label="Mengambil gambar-gambar…" :fullscreen="false" />
    <ResultsGallery
      v-else-if="results"
      :results="results"
      :me-id="session?.player_id ?? ''"
      @refresh-urls="game.refreshResultsUrls()"
    />
    <div v-else class="mt-6 text-center">
      <AppButton @click="game.loadResults(roundId)">Coba lagi</AppButton>
    </div>
  </main>
</template>
