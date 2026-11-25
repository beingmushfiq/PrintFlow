/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#121820',
          light: '#232D3B',
          dark: '#0A0E13',
        },
        paper: {
          DEFAULT: '#F7F8FA',
          light: '#FFFFFF',
          dark: '#ECEFF3',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          card: '#FFFFFF',
          subtle: '#F9FAFB',
        },
        accent: {
          DEFAULT: '#245BDB',
          hover: '#1B48B3',
          active: '#14368B',
          soft: '#EAF0FF',
        },
        status: {
          success: '#059669',
          'success-soft': '#D1FAE5',
          warning: '#D97706',
          'warning-soft': '#FEF3C7',
          error: '#DC2626',
          'error-soft': '#FEE2E2',
          info: '#2563EB',
          'info-soft': '#DBEAFE',
        },
        border: {
          DEFAULT: '#E2E6EC',
          light: '#F0F2F5',
          dark: '#CFD5DF',
        },
        muted: {
          DEFAULT: '#667085',
          light: '#98A2B3',
          dark: '#475467',
        },
        obsidian: {
          DEFAULT: '#070B14',
          surface: '#0C1427',
          elevated: '#111C35',
          border: '#1E293B',
        },
        cyanbeam: {
          DEFAULT: '#00D2FF',
          soft: 'rgba(0, 210, 255, 0.14)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'Noto Sans Bengali',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        display: [
          'Space Grotesk',
          'Noto Sans Bengali',
          'Inter',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
        bengali: [
          'Noto Sans Bengali',
          'Inter',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
