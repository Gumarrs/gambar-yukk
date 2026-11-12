<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { session, load, clear, validate } = useGuestSession()
const room = useRoom()

const name = ref('')
const avatar = ref(DEFAULT_AVATAR)
const code = ref(normalizeRoomCode(String(route.query.join ?? '')))
const busy = ref<'create' | 'join' | null>(null)
const error = ref<string | null>(null)
const resumable = ref<{ code: string } | null>(null)

onMounted(async () => {
  const s = load()
  if (s) {
    name.value = s.guest_name
    avatar.value = s.avatar_key || DEFAULT_AVATAR
    try {
      if ((await validate()) === 'ok' && session.value) resumable.value = { code: session.value.room_code }
    } catch {
      /* offline: skip the resume banner */
    }
  }
})

function onCodeInput(e: Event) {
  code.value = normalizeRoomCode((e.target as HTMLInputElement).value)
}

/** Best-effort: leave a previous room before entering another one. */
async function dropExisting() {
  if (session.value) await room.leave()
  resumable.value = null
}

async function go(kind: 'create' | 'join') {
  error.value = null
  const guestName = sanitizeName(name.value)
  if (!isValidName(guestName)) return void (error.value = 'Isi nama kamu dulu ya (maksimal 20 huruf).')
  if (kind === 'join' && !isValidRoomCode(code.value)) {
    return void (error.value = 'Kode room harus 6 karakter.')
  }
  busy.value = kind
  try {
    await dropExisting()
    const s = kind === 'create' ? await room.createRoom(guestName, avatar.value) : await room.joinRoom(code.value, guestName, avatar.value)
    await router.push(`/room/${s.room_code}`)
  } catch (e) {
    error.value = toApiError(e).message
  } finally {
    busy.value = null
  }
}

async function startFresh() {
  await room.leave()
  clear()
  resumable.value = null
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 sm:py-12">
    <header class="mb-8 text-center">
      <h1 class="font-display text-6xl font-bold leading-none sm:text-8xl" style="text-shadow: 4px 4px 0 #2b2d42">
        <span class="text-coral">Gam</span><span class="text-sun">bar</span>
        <span class="mt-1 block text-sky sm:mt-2">Bareng</span>
      </h1>
      <p class="mx-auto mt-5 max-w-xl text-lg font-bold sm:text-xl">
        Satu gambar referensi, sampai 4 pemain, waktu yang sama. Siapa gambarnya paling kocak? ✏️
      </p>
    </header>

    <ErrorBanner :message="error" class="mb-4" @dismiss="error = null" />

    <div v-if="resumable" class="sticker mb-6 flex flex-wrap items-center gap-3 bg-sun p-4">
      <p class="flex-1 font-display text-xl font-semibold">Kamu masih ada di room {{ resumable.code }}.</p>
      <AppButton variant="secondary" @click="router.push(`/room/${resumable.code}`)">Lanjut main</AppButton>
      <AppButton variant="ghost" @click="startFresh">Keluar room</AppButton>
    </div>

    <section class="sticker grid gap-6 p-6 sm:p-8 md:grid-cols-2">
      <div class="space-y-5">
        <div>
          <label for="name" class="mb-2 block font-display text-xl font-semibold">Namamu</label>
          <input id="name" v-model="name" class="input" maxlength="20" autocomplete="nickname" placeholder="Contoh: Agus" />
        </div>
        <div>
          <p class="mb-2 font-display text-xl font-semibold">Pilih avatar</p>
          <AvatarPicker v-model="avatar" />
        </div>
      </div>

      <div class="flex flex-col gap-5 md:border-l-[3px] md:border-dashed md:border-ink/20 md:pl-8">
        <div>
          <h2 class="mb-2 text-2xl font-bold">Bikin room baru</h2>
          <AppButton :loading="busy === 'create'" :disabled="busy !== null" block @click="go('create')">
            🎨 Buat room
          </AppButton>
        </div>
        <div class="flex items-center gap-3 font-display font-semibold text-ink/40">
          <span class="h-[3px] flex-1 rounded bg-ink/10" /> atau <span class="h-[3px] flex-1 rounded bg-ink/10" />
        </div>
        <form @submit.prevent="go('join')">
          <h2 class="mb-2 text-2xl font-bold">Gabung teman</h2>
          <input
            :value="code"
            class="input mb-3 text-center font-display text-3xl uppercase tracking-[0.3em]"
            inputmode="text"
            autocapitalize="characters"
            maxlength="6"
            placeholder="ABC123"
            aria-label="Kode room"
            @input="onCodeInput"
          />
          <AppButton type="submit" variant="secondary" :loading="busy === 'join'" :disabled="busy !== null" block>
            🚪 Gabung room
          </AppButton>
        </form>
      </div>
    </section>

    <section class="mt-10 grid gap-4 text-center sm:grid-cols-3">
      <div v-for="(step, i) in [
        { icon: '👯', title: 'Kumpul', text: 'Buat room, bagikan kodenya ke teman.' },
        { icon: '🖌️', title: 'Gambar', text: 'Semua dapat referensi yang sama, adu cepat & kreatif.' },
        { icon: '🖼️', title: 'Bandingkan', text: 'Lihat semua hasil gambar berdampingan. Seru!' }
      ]" :key="step.title" class="sticker p-5">
        <p class="text-4xl" :class="i === 1 ? 'animate-wiggle' : 'animate-floaty'">{{ step.icon }}</p>
        <h3 class="mt-2 text-2xl font-bold">{{ step.title }}</h3>
        <p class="font-bold text-ink/70">{{ step.text }}</p>
      </div>
    </section>
  </main>
</template>
