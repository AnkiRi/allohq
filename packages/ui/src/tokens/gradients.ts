/**
 * Gradient Tokens for Glassmorphic Effects
 */

export const gradients = {
  glass: {
    // Subtle white gradients for glass effect
    default: "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))",
    strong: "linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))",
    border: "linear-gradient(135deg, rgba(255,255,255,0.4), rgba(255,255,255,0.1))",
  },

  // Brand gradients (purple to blue)
  brand: {
    default: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
    reverse: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
    vertical: "linear-gradient(180deg, #8B5CF6 0%, #3B82F6 100%)",
  },

  // Revenue gradients (green)
  revenue: {
    default: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
    light: "linear-gradient(135deg, #86efac 0%, #10B981 100%)",
  },

  // Background gradients
  background: {
    light: "linear-gradient(135deg, #faf5ff 0%, #f0f9ff 50%, #f0f9ff 100%)",
    dark: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
  },
} as const;

export type Gradients = typeof gradients;
