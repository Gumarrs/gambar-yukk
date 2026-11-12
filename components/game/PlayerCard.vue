<script setup lang="ts">
import type { RoomPlayer } from '~/types/game'

defineProps<{ player: RoomPlayer; isMe: boolean; online: boolean | null }>()
</script>

<template>
  <div class="sticker relative flex animate-pop items-center gap-3 p-4">
    <AvatarBubble :avatar-key="player.avatar_key" :size="60" />
    <div class="min-w-0 flex-1">
      <p class="truncate font-display text-xl font-bold">
        {{ player.name }}
        <span v-if="isMe" class="ml-1 rounded-full bg-sky px-2 py-0.5 text-xs font-extrabold text-white">Kamu</span>
      </p>
      <p class="flex items-center gap-2 text-sm font-extrabold">
        <span v-if="player.is_master" class="rounded-full bg-sun px-2 py-0.5">👑 Pembuat</span>
        <span
          class="rounded-full px-2 py-0.5"
          :class="player.is_ready ? 'bg-mint text-ink' : 'bg-ink/10 text-ink/60'"
        >
          {{ player.is_ready ? '✅ Siap' : '⏳ Belum siap' }}
        </span>
      </p>
    </div>
    <span
      v-if="online !== null"
      class="absolute right-3 top-3 h-3.5 w-3.5 rounded-full border-2 border-ink"
      :class="online ? 'bg-mint' : 'bg-ink/20'"
      :title="online ? 'Online' : 'Offline'"
    />
  </div>
</template>
