/** @type {import('tailwindcss').Config} */
export default {
  // Single scope class — do NOT use comma-separated IDs (breaks selector grouping).
  important: '.hms-ui',
  corePlugins: {
    // Preflight resets global Bootstrap/Odoo styles when bundled into hms-ui.js.
    preflight: false,
  },
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Mirrors public/css/hms-tokens.css
        brand: {
          DEFAULT: '#10b981',
          dark: '#059669',
          light: '#d1fae5',
        },
        ink: {
          DEFAULT: '#1e293b',
          muted: '#64748b',
        },
      },
      borderRadius: {
        hms: '16px',
        'hms-sm': '10px',
      },
      boxShadow: {
        modal: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        card: '0 4px 24px -4px rgb(15 23 42 / 0.08)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
