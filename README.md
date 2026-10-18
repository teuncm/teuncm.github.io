# Personal landing page

Vue landing page for [teuncm.nl](https://teuncm.nl/), deployed to GitHub Pages.

Run `npm ci` and `npm run dev` to work locally. `npm run build` type-checks,
builds, then prerenders the actual Vue page into `dist/index.html`. The browser
hydrates that markup so the theme toggle and wave remain interactive. This makes
the profile and links readable without JavaScript, with no runtime server.

SEO metadata and the linked WebSite, ProfilePage, and Person JSON-LD live in
`index.html`. Keep those descriptions and profile links consistent with
`src/App.vue`. The canonical domain is also used in `public/robots.txt` and
`public/sitemap.xml`; update all three if the domain changes. The sitemap omits
`lastmod` rather than claiming a fresh content date on every deployment.

The build also generates `/signal-processing/index.html` from
`src/components/SignalProcessing.vue`, with its own title, description, canonical,
TechArticle and breadcrumb metadata. The article's JavaScript is loaded only on
that page. Its CSS is included in the initial HTML for readers without JavaScript.
The homepage links to it and the sitemap includes both pages.

All components use Composition API. `vite.config.ts` disables unused Vue Options
API support in the browser bundle; revisit that flag before adding a library
that requires Options API. Theme state is local to `ThemeToggle.vue`; the page
uses CSS variables, and the wave deliberately keeps the same palette in both
themes. Its animation clock and buffers stay outside Vue reactivity.

`public/portrait.webp` is the home page's stable social preview image (512 × 512); update it
alongside the responsive portraits in `src/assets` when replacing the photo.
The article uses `public/signal-processing.png` (1200 × 630), exported from the
code-drawn `public/signal-processing.svg`. Its visible illustration and article
metadata use the same image. Portrait URLs in the prerendered HTML must match
the built preload URLs exactly; build-only `?no-inline` queries are stripped and
checked to avoid downloading the portrait twice.

After deployment, submit `https://teuncm.nl/sitemap.xml` in Google Search Console
and inspect the home page. Local validation cannot confirm Google's indexing or
search presentation.

For name searches, link to `https://teuncm.nl/` from the website fields on your
GitHub, LinkedIn, SoundCloud and Instagram profiles. Use your real name and the
same site address consistently. Those account changes require access to the
accounts and are not part of the build. Share `/signal-processing/` when linking
specifically to the wave demo and its explanation.

After publishing, use Search Console URL Inspection for both pages and request
indexing. Watch impressions and queries before changing copy again. Generic
queries such as “signal processing” are competitive; metadata alone cannot
secure a position. Add original projects or technical notes as there is real
work to share, then link them from the homepage and include them in the sitemap.
