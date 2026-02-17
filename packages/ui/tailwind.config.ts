import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      backdropBlur: {
        "glass-sm": "4px",
        glass: "10px",
        "glass-lg": "20px",
        "glass-xl": "40px",
      },
      boxShadow: {
        neuro: "8px 8px 16px #d1d9e6, -8px -8px 16px #ffffff",
        "neuro-inset": "inset 8px 8px 16px #d1d9e6, inset -8px -8px 16px #ffffff",
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
        "glass-lg": "0 12px 48px 0 rgba(31, 38, 135, 0.5)",
      },
      backgroundImage: {
        "glass-gradient":
          "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))",
        "glass-border":
          "linear-gradient(135deg, rgba(255,255,255,0.4), rgba(255,255,255,0.1))",
      },
      colors: {
        ecommerce: {
          purple: "#8B5CF6",
          blue: "#3B82F6",
          green: "#10B981",
          orange: "#F59E0B",
        },
      },
    },
  },
  plugins: [],
};

export default config;
