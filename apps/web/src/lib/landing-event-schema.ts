import { z } from "zod";

export const landingEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("landing_view") }).strict(),
  z.object({ event: z.literal("calculator_interacted") }).strict(),
  z.object({ event: z.literal("share_link_copied") }).strict(),
  z.object({ event: z.literal("cta_clicked"), data: z.object({ location: z.enum(["nav", "hero", "close"]) }).strict() }).strict(),
  z.object({
    event: z.literal("calculator_result"),
    data: z.object({
      subscribers: z.enum(["<=5000", "<=30000", "<=150000", "<=600000", ">600000"]),
      revenue: z.enum(["<=500000", "<=2000000", "<=10000000", "<=50000000", ">50000000"]),
      emailShare: z.enum(["<=10", "<=20", "<=30", ">30"]),
      causedShare: z.enum(["<=10", "<=30", "<=50", ">50"]),
      blasts: z.enum(["<=0", "<=4", "<=8", "<=16", ">16"]),
      currency: z.enum(["INR", "USD"]),
      tool: z.enum(["shopify_email", "entered_bill"]),
      result: z.enum(["above_current_tool", "at_or_below_current_tool"]),
    }).strict(),
  }).strict(),
]);
