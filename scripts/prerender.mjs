import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

// Render the actual Vue page at build time; hydrate it in the browser.
// No extra request or JavaScript is needed to read the profile and links.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: App } = await server.ssrLoadModule('/src/App.vue')
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'))
  const template = await readFile('dist/index.html', 'utf8')
  if (!template.includes('<div id="app"></div>')) throw new Error('Missing prerender target')
  for (const page of ['home', 'signal-processing']) {
    let content = await renderToString(createSSRApp(App, { page }))
    for (const [source, asset] of Object.entries(manifest)) {
      content = content.replaceAll(`/${source}?no-inline`, `/${asset.file}`)
      content = content.replaceAll(`/${source}`, `/${asset.file}`)
    }
    if (content.includes('/src/assets/')) throw new Error('Unresolved asset in prerendered HTML')
    if (content.includes('?no-inline')) throw new Error('Build-only asset query leaked into prerendered HTML')
    let html = template.replace('<div id="app"></div>', `<div id="app">${content}</div>`)
    if (page === 'signal-processing') {
      html = signalProcessingMetadata(html)
      // Include the lazy page's styles before hydration (also works without JS).
      const entry = manifest['src/components/SignalProcessing.vue']
      if (!entry) throw new Error('Missing signal processing entry')
      const resources = [
        `<link rel="modulepreload" href="/${entry.file}" />`,
        ...(entry.css ?? []).map(file => `<link rel="stylesheet" href="/${file}" />`),
      ].join('\n')
      html = html.replace('</head>', `${resources}\n</head>`)
      // This page has no portrait; keep its image preload on the home page only.
      html = html.replace(/<link\s+rel="preload"\s+as="image"[\s\S]*?\/>/, '')
    }
    const directory = page === 'home' ? 'dist' : 'dist/signal-processing'
    await mkdir(directory, { recursive: true })
    await writeFile(`${directory}/index.html`, html)
    console.log(`Prerendered ${page}`)
  }
} finally {
  await server.close()
}

function signalProcessingMetadata(html) {
  const url = 'https://teuncm.nl/signal-processing/'
  const title = 'Sine Waves & Signal Processing | Teun Mathijssen'
  const description = 'A visual signal processing demo by Teun Mathijssen: sine wave frequency, phase, amplitude, sampling, bitcrusher quantization and chorus interference explained.'
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  const meta = (attribute, key, value) => {
    const pattern = new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="[^"]*"\\s*/>`)
    if (!pattern.test(html)) throw new Error(`Missing metadata: ${key}`)
    html = html.replace(pattern, `<meta ${attribute}="${key}" content="${escape(value)}" />`)
  }
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`)
  meta('name', 'description', description)
  meta('property', 'og:type', 'article')
  meta('property', 'og:url', url)
  meta('property', 'og:title', title)
  meta('property', 'og:description', description)
  meta('name', 'twitter:title', title)
  meta('name', 'twitter:description', description)
  meta('property', 'og:image', 'https://teuncm.nl/signal-processing.png')
  meta('property', 'og:image:type', 'image/png')
  meta('property', 'og:image:width', '1200')
  meta('property', 'og:image:height', '630')
  meta('property', 'og:image:alt', 'Sine wave and quantized wave — signal processing notes by Teun Mathijssen')
  meta('name', 'twitter:card', 'summary_large_image')
  meta('name', 'twitter:image', 'https://teuncm.nl/signal-processing.png')
  meta('name', 'twitter:image:alt', 'Sine wave and quantized wave — signal processing notes by Teun Mathijssen')
  html = html.replace(/\s*<meta property="profile:[^"]*"[^>]*>/g, '')
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  if (!match) throw new Error('Missing structured data')
  const graph = JSON.parse(match[1])['@graph']
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      ...graph.filter(node => node['@type'] !== 'ProfilePage'),
      {
        '@type': ['Article', 'TechArticle'],
        '@id': `${url}#article`,
        url,
        headline: 'Sine waves and signal processing',
        description,
        inLanguage: 'en',
        author: { '@id': 'https://teuncm.nl/#person' },
        publisher: { '@id': 'https://teuncm.nl/#person' },
        isPartOf: { '@id': 'https://teuncm.nl/#website' },
        mainEntityOfPage: url,
        about: { '@type': 'Thing', name: 'Digital signal processing' },
        image: 'https://teuncm.nl/signal-processing.png',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Teun Mathijssen', item: 'https://teuncm.nl/' },
          { '@type': 'ListItem', position: 2, name: 'Signal processing', item: url },
        ],
      },
    ],
  }
  return html.replace(match[0], `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`)
}
