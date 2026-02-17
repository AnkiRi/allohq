/**
 * Backdrop Blur Tokens for Glassmorphic Effects
 */

export const blur = {
  glass: {
    sm: "4px",
    default: "10px",
    lg: "20px",
    xl: "40px",
  },
} as const;

export type Blur = typeof blur;
