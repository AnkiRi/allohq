export interface Festivity {
  name: string;
  date: string; // MM-DD format
  region: "global" | "india" | "us";
  suggestedThemes: string[];
  suggestedDiscountRange: { min: number; max: number };
}

const FESTIVITIES: Festivity[] = [
  // Global
  { name: "New Year", date: "01-01", region: "global", suggestedThemes: ["fresh start", "new beginnings", "resolution"], suggestedDiscountRange: { min: 10, max: 30 } },
  { name: "Valentine's Day", date: "02-14", region: "global", suggestedThemes: ["love", "gifts", "couples", "self-care"], suggestedDiscountRange: { min: 10, max: 25 } },
  { name: "International Women's Day", date: "03-08", region: "global", suggestedThemes: ["empowerment", "celebration", "women"], suggestedDiscountRange: { min: 10, max: 20 } },
  { name: "Earth Day", date: "04-22", region: "global", suggestedThemes: ["sustainability", "eco-friendly", "green"], suggestedDiscountRange: { min: 5, max: 15 } },
  { name: "Black Friday", date: "11-29", region: "global", suggestedThemes: ["biggest sale", "doorbuster", "limited time"], suggestedDiscountRange: { min: 20, max: 60 } },
  { name: "Cyber Monday", date: "12-02", region: "global", suggestedThemes: ["online deals", "digital sale", "flash deals"], suggestedDiscountRange: { min: 20, max: 50 } },
  { name: "Christmas", date: "12-25", region: "global", suggestedThemes: ["holiday", "gifts", "festive", "joy"], suggestedDiscountRange: { min: 15, max: 40 } },

  // India
  { name: "Republic Day", date: "01-26", region: "india", suggestedThemes: ["patriotic", "pride", "celebration"], suggestedDiscountRange: { min: 10, max: 30 } },
  { name: "Holi", date: "03-14", region: "india", suggestedThemes: ["colors", "celebration", "joy", "spring"], suggestedDiscountRange: { min: 10, max: 30 } },
  { name: "Independence Day", date: "08-15", region: "india", suggestedThemes: ["patriotic", "freedom", "pride"], suggestedDiscountRange: { min: 10, max: 30 } },
  { name: "Raksha Bandhan", date: "08-18", region: "india", suggestedThemes: ["siblings", "bond", "gifts"], suggestedDiscountRange: { min: 10, max: 25 } },
  { name: "Diwali", date: "10-21", region: "india", suggestedThemes: ["festival of lights", "prosperity", "gifts", "celebration"], suggestedDiscountRange: { min: 20, max: 50 } },

  // US
  { name: "Memorial Day", date: "05-26", region: "us", suggestedThemes: ["summer kickoff", "honor", "sale"], suggestedDiscountRange: { min: 15, max: 35 } },
  { name: "4th of July", date: "07-04", region: "us", suggestedThemes: ["independence", "summer", "celebration", "BBQ"], suggestedDiscountRange: { min: 15, max: 30 } },
  { name: "Labor Day", date: "09-01", region: "us", suggestedThemes: ["end of summer", "back to school", "sale"], suggestedDiscountRange: { min: 15, max: 30 } },
  { name: "Thanksgiving", date: "11-27", region: "us", suggestedThemes: ["gratitude", "family", "feast"], suggestedDiscountRange: { min: 10, max: 25 } },
];

/**
 * Get festivities coming up within the next N days.
 */
export function getUpcomingFestivities(daysAhead: number = 30): Festivity[] {
  const now = new Date();
  const upcoming: Festivity[] = [];

  for (const fest of FESTIVITIES) {
    const [monthStr, dayStr] = fest.date.split("-");
    const month = parseInt(monthStr!, 10) - 1;
    const day = parseInt(dayStr!, 10);

    // Try this year and next year
    for (const yearOffset of [0, 1]) {
      const festDate = new Date(now.getFullYear() + yearOffset, month, day);
      const diffMs = festDate.getTime() - now.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays >= 0 && diffDays <= daysAhead) {
        upcoming.push(fest);
        break;
      }
    }
  }

  return upcoming;
}
