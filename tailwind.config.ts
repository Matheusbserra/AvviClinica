import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        avvi: {
          ink: "rgb(var(--avvi-ink) / <alpha-value>)",
          blue: "#b8862b",
          gold: "#b8862b",
          soft: "rgb(var(--avvi-soft) / <alpha-value>)",
          green: "#087f5b",
          red: "#c2410c",
          violet: "#6d5df6",
          line: "rgb(var(--avvi-line) / <alpha-value>)"
        }
      },
      boxShadow: {
        panel: "0 18px 45px rgba(17, 24, 39, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
