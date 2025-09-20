/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      backgroundImage: {
        'glass': 'radial-gradient(1200px 600px at 100% 0%, rgba(255,255,255,0.08), transparent 70%), radial-gradient(1200px 600px at 0% 100%, rgba(255,255,255,0.06), transparent 70%)'
      },
      boxShadow: {
        'neo': '0 10px 30px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.2)',
      },
      colors: {
        chrome: {
          DEFAULT: '#dcdcdc',
          dark: '#1a1a1a',
          light: '#f2f2f2'
        }
      }
    },
  },
  plugins: [],
}