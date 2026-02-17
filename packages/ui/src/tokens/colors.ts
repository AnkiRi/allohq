/**
 * Glassmorphic Color Tokens
 * Premium purple/blue gradient palette for e-commerce brands
 */

export const colors = {
  // Glass effects
  glass: {
    white: "rgba(255, 255, 255, 0.1)",
    whiteStrong: "rgba(255, 255, 255, 0.25)",
    black: "rgba(0, 0, 0, 0.1)",
    border: "rgba(255, 255, 255, 0.18)",
  },

  // Primary brand colors (purple/blue gradient)
  primary: {
    50: "#f0f9ff",
    100: "#e0f2fe",
    200: "#bae6fd",
    300: "#7dd3fc",
    400: "#38bdf8",
    500: "#0ea5e9",
    600: "#0284c7",
    700: "#0369a1",
    800: "#075985",
    900: "#0c4a6e",
    glass: "rgba(56, 189, 248, 0.1)",
  },

  // Purple accent (for CTAs, revenue metrics)
  purple: {
    50: "#faf5ff",
    100: "#f3e8ff",
    200: "#e9d5ff",
    300: "#d8b4fe",
    400: "#c084fc",
    500: "#a855f7",
    600: "#9333ea",
    700: "#7e22ce",
    800: "#6b21a8",
    900: "#581c87",
    glass: "rgba(168, 85, 247, 0.1)",
  },

  // Revenue green (for positive metrics)
  revenue: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    800: "#166534",
    900: "#14532d",
  },

  // Neumorphic base colors
  neuro: {
    light: "#e0e5ec",
    dark: "#a3b1c6",
    highlight: "#ffffff",
    shadow: "#d1d9e6",
  },

  // Semantic colors
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
} as const;

export type Colors = typeof colors;
