import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: { '@': path.resolve(__dirname, './resources/js') },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./resources/js/test/setup.ts'],
        // Default 'forks' pool crashes/hangs intermittently under the vite
        // container's sandboxing (random worker segfaults/timeouts, a
        // different file each run) — 'threads' doesn't fork a child process
        // per file and is stable here. See CLAUDE.md trap on this.
        pool: 'threads',
    },
})
