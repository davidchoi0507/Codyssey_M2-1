/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          // Neutral Dark (True Black based, not blue)
          darkBg: '#09090b',
          darkSurface: '#121215',
          darkCard: '#18181b',
          darkBorder: 'rgba(255, 255, 255, 0.08)',
          
          // Neutral Light (Clean White based)
          lightBg: '#fcfcfd',
          lightSurface: '#ffffff',
          lightCard: '#ffffff',
          lightBorder: '#e4e4e7',
          
          // Accent Brand Blue/Indigo (Kept strictly on highlights)
          accent: '#6366f1',
          accentHover: '#4f46e5',
          accentCyan: '#0ea5e9',
          accentGreen: '#10b981',
        }
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1.1rem' }],   // 12px
        'xs': ['0.8125rem', { lineHeight: '1.25rem' }], // 13px
        'sm': ['0.9375rem', { lineHeight: '1.4rem' }],  // 15px
        'base': ['1.03125rem', { lineHeight: '1.6rem' }], // 16.5px
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
