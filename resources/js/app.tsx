import '../css/app.css'

import { createRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    },
})

const appName =
    document.querySelector('meta[name="app-name"]')?.getAttribute('content') || 'CommunityHub'

createInertiaApp({
    title: (title) => (title ? `${title} | ${appName}` : appName),

    resolve: (name) => {
        const pages = import.meta.glob('./pages/**/*.tsx', { eager: true })
        return pages[`./pages/${name}.tsx`] as any
    },

    setup({ el, App, props }) {
        createRoot(el).render(
            <QueryClientProvider client={queryClient}>
                <App {...props} />
            </QueryClientProvider>
        )
    },

    progress: { color: '#5865F2' },
})
