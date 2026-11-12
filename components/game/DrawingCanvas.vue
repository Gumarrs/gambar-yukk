<script setup lang="ts">
import { BRUSH_SIZES, CANVAS_H, CANVAS_W, PALETTE } from '~/composables/useDrawingCanvas'

const props = defineProps<{ disabled?: boolean }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const { color, size, tool, disabled, canUndo, hasContent, undo, clear, toBlob } = useDrawingCanvas(canvasRef)

watchEffect(() => {
  disabled.value = !!props.disabled
})

defineExpose({ toBlob, hasContent })
</script>

<template>
  <div class="sticker overflow-hidden">
    <div class="flex flex-wrap items-center gap-3 border-b-[3px] border-ink bg-cream p-3">
      <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Warna">
        <button
          v-for="c in PALETTE"
          :key="c"
          type="button"
          role="radio"
          :aria-checked="tool === 'brush' && color === c"
          :aria-label="`Warna ${c}`"
          class="h-8 w-8 rounded-full border-[3px] border-ink transition hover:scale-110"
          :class="tool === 'brush' && color === c ? 'scale-110 ring-4 ring-sky/60' : ''"
          :style="{ background: c }"
          @click="((color = c), (tool = 'brush'))"
        />
      </div>

      <div class="flex items-center gap-1.5" role="radiogroup" aria-label="Ukuran kuas">
        <button
          v-for="s in BRUSH_SIZES"
          :key="s"
          type="button"
          role="radio"
          :aria-checked="size === s"
          :aria-label="`Kuas ${s}`"
          class="grid h-9 w-9 place-items-center rounded-xl border-[3px] border-ink bg-white"
          :class="size === s ? 'bg-sun' : ''"
          @click="size = s"
        >
          <span class="rounded-full bg-ink" :style="{ width: `${Math.min(s, 22)}px`, height: `${Math.min(s, 22)}px` }" />
        </button>
      </div>

      <div class="ml-auto flex gap-2">
        <button
          type="button"
          class="btn btn-secondary !px-3 !py-1.5 !text-base"
          :class="tool === 'eraser' ? '!bg-sun' : ''"
          :aria-pressed="tool === 'eraser'"
          @click="tool = tool === 'eraser' ? 'brush' : 'eraser'"
        >
          🧽 Penghapus
        </button>
        <button type="button" class="btn btn-secondary !px-3 !py-1.5 !text-base" :disabled="!canUndo || disabled" @click="undo">
          ↩️ Undo
        </button>
        <button type="button" class="btn btn-secondary !px-3 !py-1.5 !text-base" :disabled="!hasContent || disabled" @click="clear">
          🗑️ Bersihkan
        </button>
      </div>
    </div>

    <div class="relative bg-white">
      <canvas
        ref="canvasRef"
        :width="CANVAS_W"
        :height="CANVAS_H"
        class="block h-auto w-full select-none"
        :class="disabled ? 'cursor-not-allowed opacity-70' : 'cursor-crosshair'"
        style="touch-action: none; aspect-ratio: 960 / 640"
      />
      <slot name="overlay" />
    </div>
  </div>
</template>
