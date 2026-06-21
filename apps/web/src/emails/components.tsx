import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { vana } from "./brand-kit";

/** Primary, bulletproof CTA — green fill, paper-toned label. */
export function VanaButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: vana.color.primary,
        color: vana.color.onDark,
        fontFamily: vana.font.sans,
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: "0.01em",
        textDecoration: "none",
        borderRadius: vana.radius.button,
        padding: "14px 26px",
        display: "inline-block",
      }}
    >
      {children}
    </Button>
  );
}

/** Serif display heading. */
export function VanaHeading({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <Heading
      as="h1"
      className="vana-h1 vana-ink"
      style={{
        margin: 0,
        fontFamily: vana.font.serif,
        fontSize: 32,
        lineHeight: "38px",
        fontWeight: 600,
        letterSpacing: "-0.01em",
        color: vana.color.ink,
        ...style,
      }}
    >
      {children}
    </Heading>
  );
}

/** Body paragraph. */
export function VanaText({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <Text
      className="vana-body"
      style={{
        margin: "0 0 16px",
        fontFamily: vana.font.sans,
        fontSize: 16,
        lineHeight: "26px",
        color: vana.color.body,
        ...style,
      }}
    >
      {children}
    </Text>
  );
}

/** Small uppercase brand eyebrow — used once per email, deliberately. */
export function VanaEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="vana-muted"
      style={{
        margin: "0 0 12px",
        fontFamily: vana.font.sans,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: vana.color.moss,
      }}
    >
      {children}
    </Text>
  );
}
