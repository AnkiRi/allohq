// Backwards-compatible worker import; signing and verification live in the
// shared messaging package so API and workers cannot drift.
export { getUnsubscribeUrl } from "@allohq/messaging";
