import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import laravel from 'laravel-vite-plugin'
import path from 'path'

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            refresh: true,
        }),
        react(),
    ],
    resolve: {
        alias: { '@': path.resolve(__dirname, './resources/js') },
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        hmr: { host: 'localhost' },
        watch: { usePolling: true },   // needed for Docker on Windows/Mac
    },
})
