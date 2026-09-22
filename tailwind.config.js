/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--primary)",
          dark: "var(--primary-dark)",
          deep: "var(--primary-deep)",
        },
        background: "var(--background)",
        surface: "var(--surface)",
        text: "var(--text)",
        muted: "var(--muted)",
        border: "var(--border)",
        problem: "var(--problem)",
        operational: "var(--operational)",
        idea: "var(--idea)",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans Arabic'", "'Inter'", "sans-serif"],
      },
      borderRadius: {
        card: "18px",
        control: "11px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(23,32,30,0.04), 0 8px 24px -12px rgba(23,32,30,0.08)",
        pop: "0 12px 32px -8px rgba(20,141,114,0.25)",
      },
      keyframes: {
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "slide-up": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        "scale-in": { from: { opacity: 0, transform: "scale(0.96)" }, to: { opacity: 1, transform: "scale(1)" } },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out",
        "slide-up": "slide-up 0.22s ease-out",
        "scale-in": "scale-in 0.16s ease-out",
      },
    },
  },
  plugins: [],
};
