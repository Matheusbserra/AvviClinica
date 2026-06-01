import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        avvi: {
          ink: "#111827",
          blue: "#b8862b",
          gold: "#b8862b",
          soft: "#f8f2e8",
          green: "#087f5b",
          red: "#c2410c",
          violet: "#6d5df6",
          line: "#e5e7eb"
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
