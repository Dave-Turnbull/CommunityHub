/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './resources/js/**/*.{ts,tsx}',
        './resources/views/**/*.blade.php',
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    DEFAULT: '#5865F2',
                    hover:   '#4752C4',
                    muted:   '#4E5058',
                },
                surface: {
                    900: '#0f1015',
                    800: '#17191f',
                    700: '#1e2028',
                    600: '#25272f',
                    500: '#2e3038',
                    400: '#383a42',
                },
                text: {
                    primary:   '#f2f3f5',
                    secondary: '#b5bac1',
                    muted:     '#80848e',
                    link:      '#00aff4',
                },
                status: {
                    online:  '#23a55a',
                    idle:    '#f0b232',
                    dnd:     '#f23f43',
                    offline: '#80848e',
                },
                danger:  '#f23f43',
                success: '#23a55a',
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            fontSize: {
                xxs: ['0.6875rem', { lineHeight: '0.875rem' }],
            },
            spacing: {
                'room-rail':       '56px',
                'sidebar-channel': '240px',
                'sidebar-members': '240px',
            },
            borderRadius: { DEFAULT: '4px' },
            keyframes: {
                'fade-in': {
                    from: { opacity: '0', transform: 'translateY(4px)' },
                    to:   { opacity: '1', transform: 'translateY(0)' },
                },
            },
            animation: { 'fade-in': 'fade-in 0.15s ease-out' },
        },
    },
    plugins: [],
}
