<script setup lang="ts">
import { ref } from 'vue'
import WavePlayground from './components/WavePlayground.vue'

const isDark = ref(document.documentElement.classList.contains('dark'))

document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark.value ? '#0a0a0a' : '#ccc9c1')

function toggleTheme() {
  isDark.value = !isDark.value
  const theme = isDark.value ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', isDark.value)
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark.value ? '#0a0a0a' : '#ccc9c1')
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // Theme switching still works when browser storage is unavailable.
  }
}

const profileImage = 'https://github.com/teuncm.png?size=512'
const personalLinks = [
  { label: 'GitHub', href: 'https://github.com/teuncm' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/teun-mathijssen/' },
  { label: 'SoundCloud', href: 'https://soundcloud.com/tune_m' },
  { label: 'Instagram', href: 'https://www.instagram.com/dj_tune_m/' },
  { label: 'DJ showcase', href: 'https://teuncm.github.io/dj/' },
]
</script>

<template>
  <div class="min-h-screen bg-page text-ink antialiased">
    <div class="mx-auto flex min-h-screen w-[min(1080px,calc(100%-1rem))] flex-col py-2 sm:w-[min(1080px,calc(100%-2rem))] lg:w-[min(1080px,calc(100%-3rem))]">
      <header
        class="sticky top-2 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/90 px-4 py-3 shadow-[0_1px_2px_#26352b08] backdrop-blur"
      >
        <a href="#home" class="flex min-w-0 items-center gap-3">
          <img
            :src="profileImage"
            alt="Portrait of Teun Mathijssen"
            class="h-10 w-10 rounded-full border border-line object-cover"
          />
          <span class="min-w-0 leading-none">
            <strong class="block truncate text-sm font-semibold">Teun Mathijssen</strong>
            <small class="block text-[0.72rem] text-subtle">Personal website</small>
          </span>
        </a>

        <div class="ml-auto flex items-center gap-2">
          <button
            type="button"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleTheme"
            class="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:bg-inset focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <svg v-if="isDark" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
            </svg>
          </button>
        </div>
      </header>

      <main class="flex-1 pb-6">
        <section id="home" class="scroll-mt-24 pb-4 pt-6 sm:pt-8 lg:pt-10">
          <div class="grid gap-4 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div class="overflow-hidden rounded-3xl border border-line bg-surface p-4 shadow-[0_1px_2px_#26352b08] sm:p-5 lg:max-w-sm">
              <img
                :src="profileImage"
                alt="Portrait of Teun Mathijssen"
                class="aspect-square w-full rounded-2xl object-cover"
              />
            </div>

            <div class="rounded-3xl border border-line bg-surface p-6 shadow-[0_1px_2px_#26352b08] sm:p-8 lg:p-10">
              <h1 class="max-w-[12ch] text-4xl font-semibold tracking-[-0.05em] text-heading sm:text-5xl lg:text-6xl">
                Hi, I&apos;m Teun!
              </h1>
              <p class="mt-4 max-w-2xl text-base leading-7 text-ink sm:text-lg">
                /tøyn/ (NL) or
                /tjuːn/ (EN)
                <br />
                MSc student at the University of Amsterdam, interested in anything tech, AI, signal processing and music.
              </p>
              <nav aria-label="Elsewhere" class="mt-5 flex flex-wrap gap-x-5 gap-y-1">
                <a
                  v-for="link in personalLinks"
                  :key="link.label"
                  :href="link.href"
                  class="inline-flex min-h-11 items-center text-sm text-muted underline decoration-line underline-offset-4 hover:text-heading hover:decoration-muted focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-500"
                >
                  {{ link.label }}
                </a>
              </nav>
            </div>
          </div>
        </section>

        <WavePlayground :dark="isDark" />
      </main>
    </div>
  </div>
</template>
