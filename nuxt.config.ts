export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  // The game relies on sessionStorage, canvas and realtime sockets, so it runs as a SPA.
  ssr: false,
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  components: [{ path: '~/components', pathPrefix: false }],
  tailwind: { cssPath: '~/assets/css/tailwind.css' },
  runtimeConfig: {
    public: {
      // Filled from NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_ANON_KEY
      supabaseUrl: '',
      supabaseAnonKey: ''
    }
  },
  typescript: { strict: true, typeCheck: false },
  app: {
    head: {
      title: 'Gambar Bareng',
      htmlAttrs: { lang: 'id' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Gambar Bareng: gambar referensi yang sama, adu kreativitas bareng teman!' },
        { name: 'theme-color', content: '#FFC93C' }
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;700;800&display=swap'
        }
      ]
    }
  }
})
