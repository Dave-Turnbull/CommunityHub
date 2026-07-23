import '../css/app.css'

import { createRoot } from 'react-dom/client'
import { createInertiaApp, router } from '@inertiajs/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { subscribePresence } from '@/services/echo'
import type { SharedProps } from '@/types'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    },
})

const appName =
    document.querySelector('meta[name="app-name"]')?.getAttribute('content') || 'CommunityHub'

// A single, page-lifecycle-independent presence subscription for the whole
// tab — every authenticated page used to call subscribePresence() itself
// (Channels/Show, DM/Show), which meant a user only showed up as "online" to
// others while sitting on one of those two page types, and dropped off (and
// re-joined) the presence roster on every Inertia navigation in between,
// since each page's own mount/unmount tied the WebSocket join/leave to
// whichever page happened to be showing. Driving this off router's global
// 'navigate' event instead of any single page component means it survives
// every in-app navigation and only actually changes when the logged-in user
// does (login/impersonation/logout).
let stopPresence: (() => void) | null = null
let presenceUserId: string | null = null

function syncPresence(userId: string | null) {
    if (userId === presenceUserId) return
    stopPresence?.()
    presenceUserId = userId
    stopPresence = userId ? subscribePresence() : null
}

router.on('navigate', (event) => {
    syncPresence((event.detail.page.props as unknown as SharedProps).auth.user?.id ?? null)
})

createInertiaApp({
    title: (title) => (title ? `${title} | ${appName}` : appName),

    resolve: (name) => {
        // Excluding *.test.tsx matters, not just tidiness — without it this
        // eager glob bundles test files (and their vi.mock() calls) straight
        // into the browser build, which throws at runtime since Vitest's
        // mocking API doesn't exist outside the test runner.
        const pages = import.meta.glob(['./pages/**/*.tsx', '!./pages/**/*.test.tsx'], { eager: true })
        return pages[`./pages/${name}.tsx`] as any
    },

    setup({ el, App, props }) {
        syncPresence((props.initialPage.props as unknown as SharedProps).auth.user?.id ?? null)

        createRoot(el).render(
            <QueryClientProvider client={queryClient}>
                <App {...props} />
            </QueryClientProvider>
        )
    },

    progress: { color: '#5865F2' },
})
