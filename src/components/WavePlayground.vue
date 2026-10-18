<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createWaveGpu, wavePalettes, waveSegments, type WaveGpu } from './waveGpu'

const canvas = ref<HTMLCanvasElement | null>(null)
const gpuCanvas = ref<HTMLCanvasElement | null>(null)
let gpu: WaveGpu | null = null
let gpuAttempted = false
let context: CanvasRenderingContext2D | null = null
const sampleHeights = new Float64Array(33)
let curveHeights = new Float64Array(0)
let highlightHeights = new Float64Array(0)
let lastDrawState: ReturnType<typeof waveState> | null = null
let frame = 0
let wakeTimer = 0
let previousTime: number | null = null
let lastPaintTime = 0
let elapsed = 0
let width = 0
let height = 0
let visible = false
let resizeObserver: ResizeObserver | undefined
let intersectionObserver: IntersectionObserver | undefined
let motionPreference: MediaQueryList | undefined
const tau = Math.PI * 2
const seed = Math.random() * 10000
const stages = ['frequency', 'phase', 'amplitude', 'y', 'chorus'] as const
let cachedRound = -1
let targets = { startFrequency: 0, frequency: 0, startY: 0, y: 0 }

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
  return round % 3 === 0 ? 5 + Math.floor(randomAt(round, 4) * 2) : 9 + Math.floor(randomAt(round, 4) * 3)
}

function waveState(time: number) {
  // Use a shared clock to keep easing and marker timing synchronized.
  const timeline = time / 0.86
  const round = Math.floor(timeline / 15)
  const local = timeline % 15
  if (round !== cachedRound) {
    cachedRound = round
    targets = {
      startFrequency: round === 0 ? 2.4 : frequencyTarget(round - 1),
      frequency: frequencyTarget(round),
      startY: round === 0 ? yTarget(0) : yTarget(round - 1),
      y: yTarget(round),
    }
  }
  const stage = stages[Math.floor(local / 3)]!
  const legTime = local % 3
  const progress = Math.max(0, Math.min(1, (legTime - 0.3) / 2.4))
  const eased = (1 - Math.cos(Math.PI * progress)) / 2
  const startFrequency = targets.startFrequency
  const startAmplitude = round === 0 ? 0.5 : amplitudeTarget(round - 1)
  const startPhase = round % 2 === 0 ? 0 : tau
  const targetPhase = round % 2 === 0 ? tau : 0
  const frequency = stage === 'frequency' ? startFrequency + (targets.frequency - startFrequency) * eased : targets.frequency
  const phase = local < 3 ? startPhase : stage === 'phase' ? startPhase + (targetPhase - startPhase) * eased : targetPhase
  const amplitude = local < 6 ? startAmplitude : stage === 'amplitude' ? startAmplitude + (amplitudeTarget(round) - startAmplitude) * eased : amplitudeTarget(round)
  const startY = targets.startY
  const ySteps = local < 9 ? startY : stage === 'y' ? Math.round(startY + (targets.y - startY) * eased) : targets.y
  const guideOpacity = Math.min(1, legTime / 0.2, (3 - legTime) / 0.2)
  // Cycle through coarse, fine, and smooth output; retain each setting between changes.
  const startQuantization = round === 0 || (round - 1) % 3 === 2 ? 0 : 1
  const targetQuantization = round % 3 === 2 ? 0 : 1
  const quantizeY = stage === 'y'
    ? startQuantization + (targetQuantization - startQuantization) * eased
    : stage === 'chorus' ? targetQuantization : startQuantization
  const chorusDirection = round % 2 === 0 ? 1 : -1
  const chorusPhase = stage === 'chorus' ? chorusDirection * tau * eased : 0
  // Use the original signal at both endpoints, avoiding floating-point seam artifacts.
  const chorusOffset = stage === 'chorus' && progress > 0 && progress < 1 ? chorusPhase : 0
  return { stage, frequency, phase, amplitude, ySteps,
    quantizeY, chorusDirection, chorusPhase, chorusOffset, returningToSmooth: targetQuantization === 0, guideOpacity }
}

function quantize(value: number, step: number, strength: number) {
  const rounded = Math.round(value / step) * step
  return strength === 1 ? rounded : value + (rounded - value) * strength
}

function fillWaveHeights(output: Float64Array, steps: number, state: ReturnType<typeof waveState>, height: number, start = 0, span = 1) {
  const { frequency, phase, amplitude: ratio, quantizeY: strength, ySteps, chorusOffset } = state
  const amplitude = (height - 24) * ratio
  const step = (height - 24) / (2 * ySteps)
  const mid = height / 2
  const smooth = strength === 0
  const angle = tau * frequency * (start - 0.5) - Math.PI / 2 + phase + (smooth ? chorusOffset / 2 : 0)
  const delta = tau * frequency * span / steps
  const sinDelta = Math.sin(delta)
  const cosDelta = Math.cos(delta)
  const sinOffset = Math.sin(chorusOffset)
  const cosOffset = Math.cos(chorusOffset)
  const gain = smooth ? amplitude * Math.cos(chorusOffset / 2) : amplitude
  let sine = Math.sin(angle)
  let cosine = Math.cos(angle)
  // Rotate successive samples instead of evaluating sine at every point.
  for (let i = 0; i <= steps; i++) {
    let value = sine * gain
    if (!smooth) {
      // Preserve rounding at exact half-levels despite recurrence roundoff.
      if (Math.abs(Math.abs(value / step % 1) - 0.5) < 1e-10) {
        value = Math.sin(tau * frequency * (start + i * span / steps - 0.5) - Math.PI / 2 + phase) * amplitude
      }
      value = quantize(value, step, strength)
      if (chorusOffset !== 0) {
        let second = (sine * cosOffset + cosine * sinOffset) * amplitude
        if (Math.abs(Math.abs(second / step % 1) - 0.5) < 1e-10) {
          second = Math.sin(tau * frequency * (start + i * span / steps - 0.5) - Math.PI / 2 + phase + chorusOffset) * amplitude
        }
        value = (value + quantize(second, step, strength)) * 0.5
      }
    }
    output[i] = mid - value
    const nextSine = sine * cosDelta + cosine * sinDelta
    cosine = cosine * cosDelta - sine * sinDelta
    sine = nextSine
  }
}

function traceCurve(ctx: CanvasRenderingContext2D, heights: Float64Array, steps: number, startX: number, spanX: number, stepped: boolean) {
  ctx.moveTo(startX, heights[0]!)
  for (let i = 1; i <= steps; i++) {
    if (stepped && heights[i] === heights[i - 1]) continue
    const px = startX + i / steps * spanX
    if (stepped) ctx.lineTo(px, heights[i - 1]!)
    ctx.lineTo(px, heights[i]!)
  }
  if (stepped) ctx.lineTo(startX + spanX, heights[steps]!)
}

function nextChangeDelay(time: number) {
  const legTime = time / 0.86 % 3
  // Fade-in/out and continuously changing parameters need animation frames.
  if (legTime < 0.2 || legTime >= 2.8) return 0
  if (legTime < 0.3) return (0.3 - legTime) * 860
  if (legTime >= 2.7) return (2.8 - legTime) * 860
  const state = waveState(time)
  const round = Math.floor(time / 0.86 / 15)
  if (state.stage !== 'y' || round % 3 !== 1) return 0
  // During a fully quantized transition, nothing moves between level changes.
  const difference = targets.y - targets.startY
  if (difference === 0 || state.ySteps === targets.y) return (2.8 - legTime) * 860
  const nextLevel = state.ySteps + Math.sign(difference) * 0.5
  const fraction = Math.max(0, Math.min(1, (nextLevel - targets.startY) / difference))
  const changeTime = 0.3 + 2.4 * Math.acos(1 - 2 * fraction) / Math.PI
  return Math.max(0, changeTime - legTime) * 860
}

function draw() {
  const ctx = context
  if (!ctx || width < 1 || height < 1) return
  const padding = 8
  const plotWidth = width - padding * 2
  const top = 12
  const bottom = height - 12
  const mid = (top + bottom) / 2
  const state = waveState(elapsed)
  const { stage, frequency, phase, amplitude: amplitudeRatio, ySteps, quantizeY, chorusDirection, chorusPhase, chorusOffset, returningToSmooth, guideOpacity } = state
  const previous = lastDrawState
  if (previous && previous.stage === stage &&
    previous.frequency === frequency && previous.phase === phase && previous.amplitude === amplitudeRatio &&
    previous.ySteps === ySteps && previous.quantizeY === quantizeY &&
    previous.chorusDirection === chorusDirection && previous.chorusPhase === chorusPhase &&
    previous.chorusOffset === chorusOffset && previous.returningToSmooth === returningToSmooth &&
    previous.guideOpacity === guideOpacity) return
  const signalChanged = !previous || previous.frequency !== frequency || previous.phase !== phase ||
    previous.amplitude !== amplitudeRatio || previous.ySteps !== ySteps ||
    previous.quantizeY !== quantizeY || previous.chorusOffset !== chorusOffset
  lastDrawState = state
  const amplitude = (bottom - top) * amplitudeRatio
  // Quantization is fixed to the full output range, independent of input amplitude.
  const quantizationStep = (bottom - top) / (2 * ySteps)
  const sampleRate = 32
  const x = (t: number) => padding + t * plotWidth
  if (signalChanged) fillWaveHeights(sampleHeights, sampleRate, state, height)
  if (gpu) gpu.draw({ width, height, frequency, phase, amplitude: amplitudeRatio, ySteps,
    quantizeY, chorusOffset, highlight: stage === 'y' && returningToSmooth, guideOpacity })
  const colors = wavePalettes.dark
  const ink = colors.wave
  ctx.clearRect(0, 0, width, height)

  ctx.lineWidth = 1

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
    const steps = waveSegments(width, height, frequency, amplitudeRatio, quantizeY)
    const capacity = Math.max(Math.ceil(plotWidth), steps) + 1
    if (curveHeights.length < capacity) curveHeights = new Float64Array(capacity)
    if (signalChanged) fillWaveHeights(curveHeights, steps, state, height)
    ctx.strokeStyle = ink
    ctx.lineWidth = colors.strokeWidth
    ctx.lineJoin = 'round'
    ctx.beginPath()
    traceCurve(ctx, curveHeights, steps, padding, plotWidth, quantizeY === 1)
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
  ctx.fillStyle = markerInk
  ctx.lineWidth = 2
  if (stage === 'frequency') {
    // The two peaks stay symmetric about the fixed trough at the plot center.
    const startX = x(0.5 - 0.5 / frequency)
    const endX = x(0.5 + 0.5 / frequency)
    const peakY = mid - quantize(amplitude, quantizationStep, quantizeY)
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.moveTo(startX, peakY)
    ctx.lineTo(endX, peakY)
    ctx.stroke()
    ctx.setLineDash([])
    for (const px of [startX, endX]) {
      ctx.beginPath()
      ctx.arc(px, peakY, 5, 0, tau)
      ctx.fill()
      ctx.stroke()
    }
  } else if (stage === 'amplitude') {
    const peakX = x(0.5 - 0.5 / frequency)
    const peakY = mid - quantize(amplitude, quantizationStep, quantizeY)
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.moveTo(peakX, peakY)
    ctx.lineTo(peakX, mid)
    ctx.stroke()
    ctx.setLineDash([])
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
    const segmentSteps = Math.ceil(waveSegments(width, height, frequency, amplitudeRatio, quantizeY) / frequency)
    if (highlightHeights.length < segmentSteps + 1) highlightHeights = new Float64Array(segmentSteps + 1)
    if (signalChanged || previous?.stage !== stage) {
      fillWaveHeights(highlightHeights, segmentSteps, state, height, segmentStart, 1 / frequency)
    }
    traceCurve(ctx, highlightHeights, segmentSteps, x(segmentStart), plotWidth / frequency, quantizeY === 1)
    ctx.stroke()
  } else if (stage === 'y') {
    // Centered dashes suggest the available amplitude levels.
    const tickHalfWidth = Math.min(28, plotWidth * 0.05)
    ctx.save()
    ctx.globalAlpha *= 0.35
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    for (let level = -ySteps; level <= ySteps; level++) {
      const py = mid - level * quantizationStep
      ctx.moveTo(x(0.5) - tickHalfWidth, py)
      ctx.lineTo(x(0.5) + tickHalfWidth, py)
    }
    ctx.stroke()
    ctx.restore()
    const markerX = x(0.5)
    const stepY = mid - quantizationStep
    ctx.beginPath()
    ctx.moveTo(markerX, mid)
    ctx.lineTo(markerX, stepY)
    for (const py of [mid, stepY]) {
      ctx.moveTo(markerX - 8, py)
      ctx.lineTo(markerX + 8, py)
    }
    ctx.stroke()
  } else if (stage === 'chorus') {
    const startX = x(0.5 + chorusDirection * 0.5 / frequency)
    const targetX = x(0.5 - chorusDirection * 0.5 / frequency)
    const movingX = x(0.5 + (chorusDirection * 0.5 - chorusPhase / tau) / frequency)
    ctx.save()
    ctx.globalAlpha *= 0.55
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    for (const px of [startX, targetX]) {
      ctx.moveTo(px, 0)
      ctx.lineTo(px, height)
    }
    ctx.stroke()
    ctx.restore()
    ctx.beginPath()
    ctx.moveTo(movingX, 0)
    ctx.lineTo(movingX, height)
    ctx.stroke()
  } else {
    // Keep the same rising crossing, without wrapping to a different one.
    const crossingOffset = 0.25
    const movingX = x(0.5 + (crossingOffset - phase / tau) / frequency)
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.moveTo(movingX, top)
    ctx.lineTo(movingX, bottom)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(movingX, mid, 5, 0, tau)
    ctx.fillStyle = markerInk
    ctx.fill()
  }
  ctx.restore()
}

function scheduleNextFrame() {
  const delay = nextChangeDelay(elapsed)
  if (delay > 1000 / 30) {
    wakeTimer = window.setTimeout(() => {
      wakeTimer = 0
      if (visible && !document.hidden && !motionPreference?.matches) frame = requestAnimationFrame(tick)
    }, delay)
  } else {
    frame = requestAnimationFrame(tick)
  }
}

function tick(time: number) {
  frame = 0
  if (!visible || document.hidden || motionPreference?.matches) return
  if (previousTime !== null) elapsed += Math.max(0, time - previousTime) / 1000
  previousTime = time
  // At most 30 draws per second, independent of the display refresh rate.
  if (time - lastPaintTime >= 1000 / 30) {
    lastPaintTime = time
    draw()
    scheduleNextFrame()
  } else {
    frame = requestAnimationFrame(tick)
  }
}

function syncAnimation() {
  const now = performance.now()
  if (previousTime !== null) elapsed += Math.max(0, now - previousTime) / 1000
  cancelAnimationFrame(frame)
  clearTimeout(wakeTimer)
  frame = 0
  wakeTimer = 0
  previousTime = null
  if (visible && !document.hidden) {
    draw()
    if (!motionPreference?.matches) {
      previousTime = now
      lastPaintTime = now
      scheduleNextFrame()
    }
  }
}

function onContextLost(event: Event) {
  event.preventDefault()
  gpu?.dispose()
  gpu = null
  lastDrawState = null
  syncAnimation()
}

function onContextRestored() {
  gpu = createWaveGpu(gpuCanvas.value!)
  gpu?.resize(canvas.value!.width, canvas.value!.height)
  lastDrawState = null
  syncAnimation()
}

onMounted(() => {
  const element = canvas.value!
  context = element.getContext('2d')
  gpuCanvas.value!.addEventListener('webglcontextlost', onContextLost)
  gpuCanvas.value!.addEventListener('webglcontextrestored', onContextRestored)
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionPreference.addEventListener('change', syncAnimation)
  resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return
    // Use the measured size delivered by the browser without another layout read.
    width = entry.contentRect.width
    height = entry.contentRect.height
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const pixelWidth = Math.round(width * ratio)
    const pixelHeight = Math.round(height * ratio)
    if (element.width !== pixelWidth || element.height !== pixelHeight) {
      element.width = pixelWidth
      element.height = pixelHeight
      context?.setTransform(ratio, 0, 0, ratio, 0, 0)
      gpu?.resize(pixelWidth, pixelHeight)
    }
    lastDrawState = null
    if (visible && !document.hidden) draw()
  })
  resizeObserver.observe(element)
  intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false
    if (visible && !gpuAttempted) {
      gpuAttempted = true
      gpu = createWaveGpu(gpuCanvas.value!)
      gpu?.resize(element.width, element.height)
      lastDrawState = null
    }
    syncAnimation()
  })
  intersectionObserver.observe(element)
  document.addEventListener('visibilitychange', syncAnimation)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  clearTimeout(wakeTimer)
  previousTime = null
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
    class="relative overflow-hidden rounded-xl border border-line"
    :style="{ backgroundColor: wavePalettes.dark.background }"
  >
    <canvas ref="gpuCanvas" aria-hidden="true" class="pointer-events-none absolute inset-0 h-full w-full" />
    <canvas
      ref="canvas"
      class="relative block h-44 w-full sm:h-48"
      role="img"
      aria-label="Sine wave alternating frequency, phase, amplitude, vertical quantization, and chorus interference, with measurement markers."
    >
      Animated sine wave with frequency, phase, amplitude, quantization, and chorus markers.
    </canvas>
    <slot name="corner" />
  </div>
</template>
