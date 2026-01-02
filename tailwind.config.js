/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        'jua': ['Jua', 'sans-serif'],
        'gamja': ['"Gamja Flower"', 'cursive'],
        'dancing': ['"Dancing Script"', 'cursive'],
        'cyber': ['Orbitron', 'sans-serif'],
        'cyber-ui': ['Rajdhani', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'neon-pulse': 'neonPulse 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        neonPulse: {
          '0%, 100%': { boxShadow: '0 0 5px #00fff2, 0 0 15px rgba(0, 255, 242, 0.4)' },
          '50%': { boxShadow: '0 0 20px #00fff2, 0 0 40px rgba(0, 255, 242, 0.6)' },
        },
      },
      boxShadow: {
        'alchan': '0 4px 6px -1px rgba(99, 102, 241, 0.1), 0 2px 4px -2px rgba(99, 102, 241, 0.1)',
        'alchan-lg': '0 10px 15px -3px rgba(99, 102, 241, 0.1), 0 4px 6px -4px rgba(99, 102, 241, 0.1)',
        'cyber': '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 1px rgba(0, 255, 242, 0.3)',
        'cyber-glow': '0 0 15px rgba(0, 255, 242, 0.5), 0 0 30px rgba(0, 255, 242, 0.2)',
      },
      colors: {
        // Override slate to dark cyberpunk colors
        slate: {
          50: '#0a0a12',
          100: '#12121f',
          200: '#1a1a2e',
          300: 'rgba(0, 255, 242, 0.15)',
          400: '#9999bb',
          500: '#7777aa',
          600: '#e8e8ff',
          700: '#e8e8ff',
          800: '#00fff2',
          900: '#00fff2',
        },
        alchan: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        cyber: {
          dark: '#0a0a12',
          medium: '#12121f',
          light: '#1a1a2e',
          cyan: '#00fff2',
          magenta: '#ff00ff',
          purple: '#8b5cf6',
          green: '#00ff88',
          red: '#ff3366',
          yellow: '#ffd166',
          text: '#e8e8ff',
          muted: '#9999bb',
        }
      }
    },
  },
  plugins: [],
  // preflight 활성화하여 Tailwind 기본 스타일 적용
  corePlugins: {
    preflight: true,
  },
}
