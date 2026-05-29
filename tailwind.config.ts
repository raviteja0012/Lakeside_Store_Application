import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "var(--app-bg)",
        panel: "var(--panel)",
        edge: "var(--border)",
        ink: "var(--text-primary)",
        muted: "var(--text-secondary)",
        primary: "var(--primary)",
        "primary-hover": "var(--primary-hover)"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"]
      }
    }
  },
  plugins: []
};
export default config;
