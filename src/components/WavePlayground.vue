<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createWaveGpu, wavePalettes, type WaveGpu } from './waveGpu'

const props = defineProps<{ dark: boolean }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const gpuCanvas = ref<HTMLCanvasElement | null>(null)
let gpu: WaveGpu | null = null
let context: CanvasRenderingContext2D | null = null
let axes: Path2D | null = null
const sampleHeights = new Float64Array(33)
let curveHeights = new Float64Array(0)
let lastDrawKey = ''
let frame = 0
let previousTime = 0
let elapsed = 0
let width = 0
let height = 0
let visible = false
let resizeObserver: ResizeObserver | undefined
let intersectionObserver: IntersectionObserver | undefined
let motionPreference: MediaQueryList | undefined
const tau = Math.PI * 2
const seed = Math.random() * 10000

function randomAt(round: number, channel: number) {
  const value = Math.sin(round * 127.1 + channel * 311.7 + seed) * 43758.5453
  return value - Math.floor(value)
}

function frequencyTarget(round: number) {
  return round % 2 === 0 ? 4.4 + randomAt(round, 1) : 1.8 + randomAt(round, 1) * 0.8
}

function amplitudeTarget(round: number) {
  return round % 2 === 0 ? 0.5 / 3 : 0.5
}

function yTarget(round: number) {
  if (round % 3 === 2) return yTarget(round - 1)
  return round % 3 === 0 ? 4 + Math.floor(randomAt(round, 4) * 2) : 8 + Math.floor(randomAt(round, 4) * 3)
}

function waveState(time: number) {
  // Shorten all transitions by 10%, preserving their easing and marker timing.
  const timeline = time / 0.9
  const round = Math.floor(timeline / 12)
  const local = timeline % 12
  const stages = ['frequency', 'phase', 'amplitude', 'y'] as const
  const stage = stages[Math.floor(local / 3)]!
  const legTime = local % 3
  const progress = Math.max(0, Math.min(1, (legTime - 0.3) / 2.4))
  const eased = (1 - Math.cos(Math.PI * progress)) / 2
  const startFrequency = round === 0 ? 2.4 : frequencyTarget(round - 1)
  const startAmplitude = round === 0 ? 0.5 : amplitudeTarget(round - 1)
  const startPhase = round % 2 === 0 ? 0 : tau
  const targetPhase = round % 2 === 0 ? tau : 0
  const frequency = stage === 'frequency' ? startFrequency + (frequencyTarget(round) - startFrequency) * eased : frequencyTarget(round)
  const phase = local < 3 ? startPhase : stage === 'phase' ? startPhase + (targetPhase - startPhase) * eased : targetPhase
  const amplitude = local < 6 ? startAmplitude : stage === 'amplitude' ? startAmplitude + (amplitudeTarget(round) - startAmplitude) * eased : amplitudeTarget(round)
  const startY = round === 0 ? yTarget(0) : yTarget(round - 1)
  const ySteps = local < 9 ? startY : Math.round(startY + (yTarget(round) - startY) * eased)
  const guideOpacity = Math.min(1, legTime / 0.2, (3 - legTime) / 0.2)
  // Cycle through coarse, fine, and smooth output; retain each setting between changes.
  const startQuantization = round === 0 || (round - 1) % 3 === 2 ? 0 : 1
  const targetQuantization = round % 3 === 2 ? 0 : 1
  const quantizeY = stage === 'y'
    ? startQuantization + (targetQuantization - startQuantization) * eased
    : startQuantization
  return { stage, frequency, phase, startPhase, amplitude, startAmplitude, ySteps,
    quantizeY, returningToSmooth: targetQuantization === 0, guideOpacity }
}

function quantize(value: number, step: number, strength: number) {
  return value + (Math.round(value / step) * step - value) * strength
}

function draw() {
  const ctx = context
  if (!ctx || width < 1 || height < 1) return
  const padding = 8
  const plotWidth = width - padding * 2
  const top = 12
  const bottom = height - 12
  const mid = (top + bottom) / 2
  const { stage, frequency, phase, startPhase, amplitude: amplitudeRatio, startAmplitude, ySteps, quantizeY, returningToSmooth, guideOpacity } = waveState(elapsed)
  const drawKey = `${width},${height},${props.dark},${stage},${frequency},${phase},${amplitudeRatio},${startAmplitude},${ySteps},${quantizeY},${returningToSmooth},${guideOpacity},${!!gpu}`
  if (drawKey === lastDrawKey) return
  lastDrawKey = drawKey
  const amplitude = (bottom - top) * amplitudeRatio
  // Quantization is fixed to the full output range, independent of input amplitude.
  const quantizationStep = (bottom - top) / (2 * ySteps)
  const sampleRate = 32
  const x = (t: number) => padding + t * plotWidth
  // Scale around the middle trough, so changing frequency never translates it.
  const y = (t: number) => {
    const signal = Math.sin(tau * frequency * (t - 0.5) - Math.PI / 2 + phase)
    return mid - quantize(signal * amplitude, quantizationStep, quantizeY)
  }
  for (let i = 0; i <= sampleRate; i++) sampleHeights[i] = y(i / sampleRate)
  if (gpu) gpu.draw({ width, height, frequency, phase, amplitude: amplitudeRatio, ySteps,
    quantizeY, dark: props.dark, highlight: stage === 'y' && returningToSmooth, guideOpacity })
  const colors = props.dark ? wavePalettes.dark : wavePalettes.light
  const ink = colors.wave
  ctx.clearRect(0, 0, width, height)

  // Only the horizontal zero axis and the vertical center axis.
  ctx.lineWidth = 1
  ctx.strokeStyle = colors.axis
  if (axes) ctx.stroke(axes)

  // Draw stems as a single path. Samples always sit on the current signal.
  ctx.strokeStyle = colors.stems
  ctx.beginPath()
  for (let i = 0; i <= sampleRate; i++) {
    const t = i / sampleRate
    ctx.moveTo(x(t), mid)
    ctx.lineTo(x(t), sampleHeights[i]!)
  }
  ctx.stroke()

  if (!gpu) {
    // Reuse storage and evaluate each curve vertex only once in the CPU fallback.
    const steps = Math.ceil(plotWidth)
    if (curveHeights.length !== steps + 1) curveHeights = new Float64Array(steps + 1)
    for (let i = 0; i <= steps; i++) curveHeights[i] = y(i / steps)
    ctx.strokeStyle = ink
    ctx.lineWidth = colors.strokeWidth
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i <= steps; i++) {
      const px = x(i / steps)
      const py = curveHeights[i]!
      if (i === 0) ctx.moveTo(px, py)
      else {
        if (quantizeY === 1) ctx.lineTo(px, curveHeights[i - 1]!)
        ctx.lineTo(px, py)
      }
    }
    ctx.stroke()
  }
  ctx.fillStyle = colors.sample
  ctx.beginPath()
  for (let i = 0; i <= sampleRate; i++) {
    const t = i / sampleRate
    ctx.moveTo(x(t) + colors.sampleRadius, sampleHeights[i]!)
    ctx.arc(x(t), sampleHeights[i]!, colors.sampleRadius, 0, tau)
  }
  ctx.fill()

  ctx.save()
  ctx.globalAlpha = guideOpacity
  const markerInk = colors.marker
  ctx.strokeStyle = markerInk
  ctx.fillStyle = colors.background
  ctx.lineWidth = 2
  if (stage === 'frequency') {
    // The two peaks stay symmetric about the fixed trough at the plot center.
    const startX = x(0.5 - 0.5 / frequency)
    const endX = x(0.5 + 0.5 / frequency)
    const peakY = mid - quantize(amplitude, quantizationStep, quantizeY)
    ctx.beginPath()
    ctx.moveTo(startX, peakY)
    ctx.lineTo(endX, peakY)
    for (const px of [startX, endX]) {
      ctx.moveTo(px, peakY - 9)
      ctx.lineTo(px, peakY + 9)
    }
    ctx.stroke()
    for (const px of [startX, endX]) {
      ctx.beginPath()
      ctx.arc(px, peakY, 5, 0, tau)
      ctx.fill()
      ctx.stroke()
    }
  } else if (stage === 'amplitude') {
    const peakX = x(0.5 - 0.5 / frequency)
    const startY = mid - quantize(startAmplitude * (bottom - top), quantizationStep, quantizeY)
    const peakY = mid - quantize(amplitude, quantizationStep, quantizeY)
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.moveTo(padding, startY)
    ctx.lineTo(width - padding, startY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(peakX, mid)
    ctx.lineTo(peakX, peakY)
    for (const py of [mid, peakY]) {
      ctx.moveTo(peakX - 9, py)
      ctx.lineTo(peakX + 9, py)
    }
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(peakX, peakY, 5, 0, tau)
    ctx.fill()
    ctx.stroke()
  } else if (stage === 'y' && returningToSmooth) {
    if (gpu) { ctx.restore(); return }
    // Highlight the actual output for one period as its steps become a curve.
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    const segmentStart = 0.5 - 0.5 / frequency
    const segmentSteps = Math.ceil(plotWidth / frequency)
    let lastY = y(segmentStart)
    for (let i = 0; i <= segmentSteps; i++) {
      const t = segmentStart + i / (segmentSteps * frequency)
      const py = y(t)
      if (i === 0) ctx.moveTo(x(t), py)
      else {
        if (quantizeY === 1) ctx.lineTo(x(t), lastY)
        ctx.lineTo(x(t), py)
      }
      lastY = py
    }
    ctx.stroke()
  } else if (stage === 'y') {
    // Short ticks mark the available amplitude levels without a background grid.
    ctx.save()
    ctx.globalAlpha *= 0.35
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    for (let level = -ySteps; level <= ySteps; level++) {
      const py = mid - level * quantizationStep
      ctx.moveTo(x(0.85) - 5, py)
      ctx.lineTo(x(0.85) + 5, py)
    }
    ctx.stroke()
    ctx.restore()
    const markerX = x(0.85)
    const stepY = mid - quantizationStep
    ctx.beginPath()
    ctx.moveTo(markerX, mid)
    ctx.lineTo(markerX, stepY)
    for (const py of [mid, stepY]) {
      ctx.moveTo(markerX - 8, py)
      ctx.lineTo(markerX + 8, py)
    }
    ctx.stroke()
  } else {
    // Keep the same rising crossing, without wrapping to a different one.
    const crossingOffset = 0.25
    const startX = x(0.5 + (crossingOffset - startPhase / tau) / frequency)
    const movingX = x(0.5 + (crossingOffset - phase / tau) / frequency)
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.moveTo(startX, top)
    ctx.lineTo(startX, bottom)
    ctx.stroke()
    ctx.setLineDash([])
    // The hollow marker records the initial crossing; the filled marker follows it.
    ctx.beginPath()
    ctx.arc(startX, mid, 6, 0, tau)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(movingX, top)
    ctx.lineTo(movingX, bottom)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(movingX, mid, 5, 0, tau)
    ctx.fillStyle = markerInk
    ctx.fill()
  }
  ctx.restore()
}

function tick(time: number) {
  frame = 0
  if (!visible || document.hidden || motionPreference?.matches) return
  // At most 30 draws per second, independent of the display refresh rate.
  if (!previousTime || time - previousTime >= 1000 / 30) {
    if (previousTime) elapsed += Math.min(time - previousTime, 100) / 1000
    previousTime = time
    draw()
  }
  frame = requestAnimationFrame(tick)
}

function syncAnimation() {
  cancelAnimationFrame(frame)
  frame = 0
  previousTime = 0
  if (visible && !document.hidden) {
    draw()
    if (!motionPreference?.matches) frame = requestAnimationFrame(tick)
  }
}

watch(() => props.dark, () => {
  if (visible && !document.hidden) draw()
})

function onContextLost(event: Event) {
  event.preventDefault()
  gpu?.dispose()
  gpu = null
  lastDrawKey = ''
  syncAnimation()
}

function onContextRestored() {
  gpu = createWaveGpu(gpuCanvas.value!)
  gpu?.resize(canvas.value!.width, canvas.value!.height)
  lastDrawKey = ''
  syncAnimation()
}

onMounted(() => {
  const element = canvas.value!
  context = element.getContext('2d')
  gpu = createWaveGpu(gpuCanvas.value!)
  gpuCanvas.value!.addEventListener('webglcontextlost', onContextLost)
  gpuCanvas.value!.addEventListener('webglcontextrestored', onContextRestored)
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionPreference.addEventListener('change', syncAnimation)
  resizeObserver = new ResizeObserver(() => {
    const bounds = element.getBoundingClientRect()
    width = bounds.width
    height = bounds.height
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const pixelWidth = Math.round(width * ratio)
    const pixelHeight = Math.round(height * ratio)
    if (element.width !== pixelWidth || element.height !== pixelHeight) {
      element.width = pixelWidth
      element.height = pixelHeight
      context?.setTransform(ratio, 0, 0, ratio, 0, 0)
      gpu?.resize(pixelWidth, pixelHeight)
    }
    axes = new Path2D()
    axes.moveTo(8, height / 2)
    axes.lineTo(width - 8, height / 2)
    axes.moveTo(width / 2, 12)
    axes.lineTo(width / 2, height - 12)
    lastDrawKey = ''
    if (visible && !document.hidden) draw()
  })
  resizeObserver.observe(element)
  intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false
    syncAnimation()
  })
  intersectionObserver.observe(element)
  document.addEventListener('visibilitychange', syncAnimation)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  gpuCanvas.value?.removeEventListener('webglcontextlost', onContextLost)
  gpuCanvas.value?.removeEventListener('webglcontextrestored', onContextRestored)
  gpu?.dispose()
  gpu = null
  context = null
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
  motionPreference?.removeEventListener('change', syncAnimation)
  document.removeEventListener('visibilitychange', syncAnimation)
})
</script>

<template>
  <div
    class="relative mt-5 overflow-hidden rounded-2xl border border-line"
    :style="{ backgroundColor: (dark ? wavePalettes.dark : wavePalettes.light).background }"
  >
    <canvas ref="gpuCanvas" aria-hidden="true" class="pointer-events-none absolute inset-0 h-full w-full" />
    <canvas
      ref="canvas"
      class="relative block h-48 w-full sm:h-56"
      role="img"
      aria-label="Sine wave alternating frequency, phase, amplitude, and vertical quantization, with measurement markers."
    >
      Animated sine wave with frequency, phase, amplitude, and quantization markers.
    </canvas>
  </div>
</template>
