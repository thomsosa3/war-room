/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Calm, dense palette: deep slate/granite ground, muted pine primary,
        // a single warm ember accent reserved for the "now" line + at-risk flags.
        ground: {
          DEFAULT: "#15181d", // deep slate, not pure black
          raised: "#1b1f26",
          panel: "#21262f",
          line: "#2c333d",
        },
        pine: {
          DEFAULT: "#4f8a6b",
          soft: "#3c6b52",
          dim: "#2a4d3a",
        },
        ember: {
          DEFAULT: "#e0913f",
          soft: "#c97a2c",
        },
        ink: {
          DEFAULT: "#e8eaed",
          soft: "#aab2bd",
          faint: "#6b7480",
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
