/**
 * Demo / sandbox mode — shared constants.
 *
 * A storeless authenticated visitor (e.g. a VC opening a link) can explore allo
 * as the already-seeded "Vana Naturals" brand. Their requests are routed to this
 * workspace READ-MOSTLY; mutations are short-circuited (ctx.isDemo) so nothing
 * real fires and the shared seed never mutates (so it resets for the next visitor).
 */
export const DEMO_STORE_ID = "cmm0d6gex00030bdtke78ancx"; // Vana Naturals (seeded)
export const DEMO_WORKSPACE_ID = "cmlxvozgh00000bup4o6fmko6";
export const DEMO_STORE_NAME = "Vana Naturals";
/** Header the web client sends when a storeless visitor is in demo mode. */
export const DEMO_HEADER = "x-allo-demo";
