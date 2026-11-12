<script setup lang="ts">
import type { RoomPlayer } from '~/types/game'
import type { RealtimeStatus } from '~/composables/useRealtimeRoom'

const props = defineProps<{
  players: RoomPlayer[]
  meId: string
  maxPlayers: number
  onlineIds: Set<string>
  realtimeStatus: RealtimeStatus
}>()

const emptySlots = computed(() => Math.max(0, props.maxPlayers - props.players.length))

function onlineOf(p: RoomPlayer): boolean | null {
  // Presence is live; the backend flag (heartbeat) is the fallback and a second opinion.
  if (props.realtimeStatus === 'connected') return props.onlineIds.has(p.id) || p.is_online === true
  return p.is_online
}
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <PlayerCard v-for="p in players" :key="p.id" :player="p" :is-me="p.id === meId" :online="onlineOf(p)" />
    <div
      v-for="n in emptySlots"
      :key="`empty-${n}`"
      class="flex items-center gap-3 rounded-3xl border-[3px] border-dashed border-ink/30 p-4 text-ink/50"
    >
      <span class="grid h-[60px] w-[60px] place-items-center rounded-full border-[3px] border-dashed border-ink/30 text-2xl">
        ?
      </span>
      <p class="font-display text-lg font-semibold">Menunggu teman…</p>
    </div>
  </div>
</template>
