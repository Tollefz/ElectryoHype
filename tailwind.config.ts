import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#00C853',
          dark: '#00A844',
          light: '#E8F5E9',
        },
        dark: {
          DEFAULT: '#000000',
          secondary: '#1a1a1a',
        },
        gray: {
          light: '#f5f5f5',
          medium: '#666666',
          border: '#e0e0e0',
        },
        sale: '#e53935',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
