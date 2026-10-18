<script setup lang="ts">
import WavePlayground from './WavePlayground.vue'
</script>

<template>
  <article class="flex flex-col gap-4">
    <header class="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <nav aria-label="Breadcrumb" class="mb-3 text-sm text-muted">
        <a href="/" class="underline underline-offset-4 hover:text-heading">Teun Mathijssen</a>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Signal processing</span>
      </nav>
      <h1 class="text-2xl font-medium text-heading sm:text-3xl">Sine waves and signal processing</h1>
      <p class="mt-2 text-sm text-muted">Notes by <a href="/" rel="author" class="underline underline-offset-4">Teun Mathijssen · Teun M.</a></p>
      <p class="mt-4 max-w-3xl leading-7">
        The wave on my homepage cycles through frequency, phase, amplitude, quantization and
        interference. These are the signal processing ideas behind the animation, and a few
        details that make the changes easier to see.
      </p>
      <nav aria-label="On this page" class="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
        <a v-for="section in ['Frequency', 'Phase', 'Amplitude', 'Quantization', 'Sampling', 'Chorus']" :key="section" :href="`#${section.toLowerCase()}`" class="underline underline-offset-4 hover:text-heading">{{ section }}</a>
      </nav>
    </header>

    <WavePlayground />

    <div class="signal-notes rounded-xl border border-line bg-surface p-5 sm:p-6">
      <section aria-labelledby="sine-wave">
        <h2 id="sine-wave">Start with a sine wave</h2>
        <p>A sine wave can be written as <code>x(t) = A sin(2πft + φ)</code>. Amplitude <code>A</code>
          sets its height, frequency <code>f</code> sets the number of cycles per second, and phase
          <code>φ</code> sets its position within a cycle. The plot shows a one-second window;
          horizontal position represents time and vertical position represents signal amplitude.</p>
      </section>

      <section aria-labelledby="frequency">
        <h2 id="frequency">Frequency: change the spacing</h2>
        <p>Increasing frequency fits more cycles into the same window. The period is
          <code>T = 1/f</code>: at 2 Hz, one cycle takes half a second. In this demo, the dashed
          peak-to-peak line spans one period.</p>
        <p>The frequency transition is centered on a trough. Anchoring that trough keeps the wave
          from sliding sideways while its peaks move closer together or farther apart.</p>
      </section>

      <section aria-labelledby="phase">
        <h2 id="phase">Phase: move through a cycle</h2>
        <p>Changing phase moves the wave horizontally without changing its frequency or amplitude.
          A phase change of <code>2π</code> radians is one full cycle, returning the signal to the
          same shape and position. The moving dashed line follows one zero crossing.</p>
      </section>

      <section aria-labelledby="amplitude">
        <h2 id="amplitude">Amplitude: scale the height</h2>
        <p>The amplitude transition scales the signal about zero. Its dashed line measures from
          zero to a positive peak. The smallest amplitude is one third of the largest, while
          the quantization levels stay fixed. Turning down the wave therefore uses fewer levels;
          it does not move the levels closer together.</p>
      </section>

      <section aria-labelledby="quantization">
        <h2 id="quantization">Quantization: turn a curve into steps</h2>
        <p>Amplitude quantization rounds values to a set of levels. For a level spacing
          <code>Δ</code>, the operation is <code>Q(x) = Δ round(x/Δ)</code>. Larger spacing produces
          more obvious steps. The centered horizontal markers show the available levels.</p>
        <p>This is the amplitude-reduction part of a bitcrusher. The demo blends between the
          original signal and the rounded signal so the transitions stay fluid. It also sometimes
          returns to the smooth wave; the highlighted curve follows that change.</p>
        <figure class="mt-4 max-w-3xl">
          <img src="/signal-processing.png" width="1200" height="630" loading="lazy" decoding="async" alt="A smooth sine wave above the same signal rounded to discrete amplitude levels." class="h-auto w-full rounded-xl border border-line" />
          <figcaption class="mt-2 text-sm text-muted">The same sine wave before and after amplitude quantization.</figcaption>
        </figure>
      </section>

      <section aria-labelledby="sampling">
        <h2 id="sampling">Sample dots and quantization are different</h2>
        <p>The 33 dots are evaluations of the signal at evenly spaced times. Their horizontal
          positions are discrete, but that alone does not quantize their vertical values.
          With amplitude quantization off, each dot sits on the smooth sine wave. With it on,
          the dot follows the processed signal.</p>
        <p>The curve itself is drawn with many more segments than the sample dots. Reducing the
          number of dots and reducing amplitude resolution are separate operations.</p>
      </section>

      <section aria-labelledby="chorus">
        <h2 id="chorus">The chorus transition: two waves interfering</h2>
        <p>The chorus-inspired transition adds two copies of the signal, each at half amplitude,
          then shifts the second copy through one full phase cycle. The vertical lines mark
          its starting position, destination and current position.</p>
        <p>For an unquantized sine wave, the sum simplifies to
          <code>A sin(θ + δ/2) cos(δ/2)</code>, where <code>θ</code> is the original phase and
          <code>δ</code> is the phase difference between the copies. At half a cycle of difference,
          the copies cancel. After a full cycle they line up again, so the second copy can be
          removed without a jump.</p>
        <p>This is a visual demonstration of interference. An <a href="https://docs.juce.com/master/classjuce_1_1dsp_1_1Chorus.html">audio chorus</a> usually mixes a signal
          with a short, modulated delay; the demo uses a phase sweep instead. When quantization is
          active, each copy is quantized before the two are added.</p>
      </section>

      <section aria-labelledby="rendering">
        <h2 id="rendering">Drawing it efficiently</h2>
        <p>The plot uses WebGL2 when available and falls back to Canvas 2D. Drawing is capped at
          30 frames per second and pauses when the plot is off-screen or the tab is hidden.
          Reduced-motion preferences keep the plot still. Smooth curves use fewer segments
          than stepped ones, and the smooth chorus uses the equivalent single-sine expression above.</p>
        <p><a href="https://github.com/teuncm/teuncm.github.io">Source code for this site</a> ·
          <a href="https://www.dspguide.com/ch3.htm">Sampling and quantization in The Scientist and Engineer’s Guide to DSP</a></p>
      </section>
    </div>
  </article>
</template>

<style>
.signal-notes section + section { margin-top: 1.75rem; }
.signal-notes h2 { color: var(--heading); font-size: 1.125rem; font-weight: 500; }
.signal-notes h2[id] { scroll-margin-top: 5rem; }
.signal-notes p { max-width: 75ch; margin-top: 0.75rem; line-height: 1.8; }
.signal-notes code { overflow-wrap: anywhere; font-size: 0.9em; color: var(--heading); }
.signal-notes a { color: var(--heading); text-decoration: underline; text-underline-offset: 4px; }
</style>
