import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        border: "hsl(var(--border))",
        primary: "hsl(var(--primary))",
        accent: "hsl(var(--accent))"
      },
      borderRadius: {
        xl: "1rem"
      },
      boxShadow: {
        card: "0 24px 60px -32px rgba(15, 23, 42, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
