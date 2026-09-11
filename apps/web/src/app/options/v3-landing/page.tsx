import type { Metadata } from "next";
import { V3Landing } from "./Landing";
import "../v2/v2.css";

export const metadata: Metadata = {
  title: "joon · the email tool that gets paid to send less",
  description:
    "Joon helps Shopify brands send fewer, better emails, with merchant approval and a measurable control.",
};

export default function V3LandingPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <V3Landing {...props} />;
}
