/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0E24',
        surface: '#141A3D',
        surface2: '#1B2251',
        line: '#2A3268',
        signal: '#2FE6D6',
        saffron: '#FFB238',
        coral: '#FF6B5E',
        muted: '#8B90B3',
        offwhite: '#F1F3FA',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(47,230,214,0.25), 0 0 24px rgba(47,230,214,0.15)',
      },
    },
  },
  plugins: [],
}
