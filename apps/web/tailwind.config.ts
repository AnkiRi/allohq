import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
        serif: ["'Fraunces'", "Georgia", "serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        terracotta: {
          DEFAULT: "#C4704A",
          light: "rgba(196, 112, 74, 0.08)",
        },
        olive: {
          DEFAULT: "#6B7A2F",
          light: "rgba(107, 122, 47, 0.08)",
        },
        "warm-gold": {
          DEFAULT: "#B8963E",
          light: "rgba(184, 150, 62, 0.08)",
        },
        info: {
          DEFAULT: "#7B9EBD",
          light: "rgba(123, 158, 189, 0.08)",
        },
        success: {
          DEFAULT: "#6B8F5E",
          light: "rgba(107, 143, 94, 0.08)",
        },
        warning: {
          DEFAULT: "#C49A3C",
          light: "rgba(196, 154, 60, 0.08)",
        },
        urgent: {
          DEFAULT: "#C4704D",
          light: "rgba(196, 112, 77, 0.08)",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      backdropBlur: {
        glass: "20px",
      },
      boxShadow: {
        glass: "0 4px 24px rgba(0, 0, 0, 0.06)",
        "glass-hover": "0 8px 32px rgba(0, 0, 0, 0.1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "stagger-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "progress-fill": {
          from: { width: "0%" },
          to: { width: "var(--progress-width, 100%)" },
        },
        "pulse-terracotta": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(196, 112, 74, 0.4)" },
          "50%": { boxShadow: "0 0 0 6px rgba(196, 112, 74, 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-slide-up": "fade-slide-up 0.4s ease-out forwards",
        "stagger-in": "stagger-in 0.35s ease-out forwards",
        "progress-fill": "progress-fill 1s ease-out forwards",
        "pulse-terracotta": "pulse-terracotta 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
