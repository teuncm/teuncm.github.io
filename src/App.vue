<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import WavePlayground from './components/WavePlayground.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import portrait144 from './assets/teun-144.webp?no-inline'
import portrait256 from './assets/teun-256.webp?no-inline'
import portrait352 from './assets/teun-352.webp?no-inline'
import portrait512 from './assets/teun-512.webp?no-inline'

const props = withDefaults(defineProps<{ page?: 'home' | 'signal-processing' }>(), { page: 'home' })
const SignalProcessing = defineAsyncComponent(() => import('./components/SignalProcessing.vue'))

const portraitSrcset = `${portrait144} 144w, ${portrait256} 256w, ${portrait352} 352w, ${portrait512} 512w`
const personalLinks = [
  { label: 'Tune:M DJ showcase', href: 'https://teuncm.nl/dj/', rel: 'me' },
  { label: 'GitHub', href: 'https://github.com/teuncm', rel: 'me' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/teun-mathijssen/', rel: 'me' },
  { label: 'SoundCloud', href: 'https://soundcloud.com/tune_m', rel: 'me' },
  { label: 'Instagram', href: 'https://www.instagram.com/dj_tune_m/', rel: 'me' },
  { label: 'Fourier Grid', href: 'https://teuncm.nl/fourier-grid/' },
]
</script>

<template>
  <div class="flex min-h-screen flex-col bg-page text-ink antialiased">
    <header
      class="sticky top-0 z-20 w-full border-b border-line bg-surface/90 backdrop-blur"
    >
      <div class="mx-auto flex w-[min(1080px,calc(100%-1rem))] items-center justify-between gap-2 pb-1 pt-[5px] sm:w-[min(1080px,calc(100%-2rem))]">
        <a :href="props.page === 'home' ? '#home' : '/'" class="flex min-h-11 min-w-0 items-center rounded-sm px-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-500">
          <h1 v-if="props.page === 'home'" class="truncate text-base font-semibold">Teun M.</h1>
          <span v-else class="truncate text-base font-semibold">Teun M.</span>
        </a>

        <div class="-mr-1 ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>

    <main class="mx-auto flex w-[min(1080px,calc(100%-1rem))] flex-1 flex-col gap-4 py-4 sm:w-[min(1080px,calc(100%-2rem))]">
      <template v-if="props.page === 'home'">
      <section id="home" class="scroll-mt-24">
        <div class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_#26352b08] sm:grid-cols-[8rem_minmax(0,1fr)] lg:grid-cols-[11rem_minmax(0,1fr)]">
          <img
            :src="portrait352"
            :srcset="portraitSrcset"
            sizes="(min-width: 1024px) 176px, (min-width: 640px) 128px, 72px"
            fetchpriority="high"
            loading="eager"
            decoding="async"
            alt="Portrait of Teun Mathijssen"
            width="176"
            height="176"
            class="aspect-square w-full self-start rounded-xl object-cover sm:row-span-3"
          />

          <div class="min-w-0 self-center">
            <h2 class="text-xl font-medium leading-relaxed text-heading sm:text-2xl lg:text-3xl">
              <span class="whitespace-nowrap">/tøyn/ (NL)</span>, <span class="whitespace-nowrap">/tjuːn/ (EN)</span>
            </h2>
          </div>
          <p class="col-span-2 max-w-2xl text-base leading-7 text-ink sm:col-span-1 sm:col-start-2 sm:text-lg">
            Teun Mathijssen — MSc student at the University of Amsterdam, interested in all things tech, AI, language, signal processing and music.
          </p>
          <nav aria-label="Projects and profiles" class="col-span-2 flex flex-wrap gap-x-4 gap-y-0 sm:col-span-1 sm:col-start-2">
            <a
              v-for="link in personalLinks"
              :rel="link.rel"
              :key="link.label"
              :href="link.href"
              class="group inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-sm text-sm font-medium text-teal-800 hover:text-teal-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600 dark:text-teal-300 dark:hover:text-teal-100 dark:focus-visible:outline-teal-300"
            >
              <span class="underline decoration-current underline-offset-4 group-hover:decoration-2">{{ link.label }}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
            </a>
          </nav>
        </div>
      </section>

      <WavePlayground>
        <template #corner>
          <a href="/signal-processing/" class="absolute bottom-0.5 right-0.5 inline-flex cursor-pointer items-center rounded-sm bg-[#0d1112]/90 px-0.5 py-px text-[10px] leading-tight text-[#8b9c98] transition-colors hover:text-[#b4dbd1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300">Signal processing notes</a>
        </template>
      </WavePlayground>
      </template>
      <SignalProcessing v-else />
    </main>
  </div>
</template>
