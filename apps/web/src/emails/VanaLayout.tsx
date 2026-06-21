import * as React from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { vana } from "./brand-kit";

type VanaLayoutProps = {
  /** Inbox preview text (the dim line after the subject). */
  preview: string;
  children: React.ReactNode;
};

/**
 * Shared identity shell for every Vana email: <head> defaults, the
 * wordmark header, and the footer. Driven entirely by the brand kit so
 * future generated emails reuse one consistent look.
 *
 * Dark-mode-safe:
 *  - color-scheme + supported-color-schemes meta tells clients we handle both.
 *  - the wordmark sits on a green pill, not transparent — it never vanishes
 *    when Gmail/Apple invert a light layout.
 *  - borders use a sand hairline that survives dark inversion.
 */
export function VanaLayout({ preview, children }: VanaLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* eslint-disable-next-line react/no-danger */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Fluid type + safe link color across clients */
              a { color: ${vana.color.moss}; }
              /* Keep our surface readable if a client forces dark mode */
              @media (prefers-color-scheme: dark) {
                .vana-paper { background-color: #14150F !important; }
                .vana-surface { background-color: #1C1E16 !important; }
                .vana-ink { color: ${vana.color.paper} !important; }
                .vana-body { color: #D7D4C7 !important; }
                .vana-muted { color: #9C9A8B !important; }
                .vana-card-border { border-color: #2F3326 !important; }
              }
              @media only screen and (max-width: 600px) {
                .vana-pad { padding-left: 22px !important; padding-right: 22px !important; }
                .vana-h1 { font-size: 28px !important; line-height: 34px !important; }
                .vana-stack { display: block !important; width: 100% !important; }
              }
            `,
          }}
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        className="vana-paper"
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: vana.color.paper,
          fontFamily: vana.font.sans,
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {/* Outer breathing room */}
        <Container
          style={{
            width: "100%",
            maxWidth: vana.contentWidth,
            margin: "0 auto",
            padding: "0",
          }}
        >
          {/* Header — wordmark on a green pill so it survives dark mode */}
          <Section style={{ padding: "28px 28px 8px" }} className="vana-pad">
            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              style={{ borderCollapse: "collapse" }}
            >
              <tr>
                <td
                  style={{
                    backgroundColor: vana.color.primary,
                    borderRadius: 999,
                    padding: "8px 18px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: vana.font.serif,
                      fontSize: 19,
                      letterSpacing: "0.06em",
                      fontWeight: 600,
                      color: vana.color.onDark,
                    }}
                  >
                    {vana.wordmark}
                  </span>
                  <span
                    style={{
                      fontFamily: vana.font.sans,
                      fontSize: 11,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: vana.color.onDarkMuted,
                      marginLeft: 8,
                    }}
                  >
                    Naturals
                  </span>
                </td>
              </tr>
            </table>
          </Section>

          {/* Email body card */}
          <Section
            className="vana-surface vana-card-border"
            style={{
              backgroundColor: vana.color.surface,
              border: `1px solid ${vana.color.sandLine}`,
              borderRadius: vana.radius.card,
              margin: "12px 0 0",
              overflow: "hidden",
            }}
          >
            {children}
          </Section>

          {/* Footer */}
          <Section style={{ padding: "26px 28px 40px" }} className="vana-pad">
            <Text
              className="vana-ink"
              style={{
                margin: "0 0 4px",
                fontFamily: vana.font.serif,
                fontSize: 16,
                color: vana.color.ink,
              }}
            >
              {vana.wordmark} Naturals
            </Text>
            <Text
              className="vana-muted"
              style={{
                margin: "0 0 14px",
                fontFamily: vana.font.sans,
                fontSize: 13,
                lineHeight: "20px",
                color: vana.color.muted,
              }}
            >
              {vana.tagline}. Made in small batches in the Nilgiris.
            </Text>
            <Hr
              className="vana-card-border"
              style={{
                borderColor: vana.color.sandLine,
                borderTop: `1px solid ${vana.color.sandLine}`,
                margin: "0 0 14px",
              }}
            />
            <Text
              className="vana-muted"
              style={{
                margin: 0,
                fontFamily: vana.font.sans,
                fontSize: 12,
                lineHeight: "18px",
                color: vana.color.muted,
              }}
            >
              You're receiving this because you're a {vana.wordmark} customer.{" "}
              <Link
                href={`${vana.url}/preferences`}
                style={{ color: vana.color.moss }}
              >
                Email preferences
              </Link>{" "}
              ·{" "}
              <Link
                href={`${vana.url}/unsubscribe`}
                style={{ color: vana.color.moss }}
              >
                Unsubscribe
              </Link>
            </Text>
            <Text
              className="vana-muted"
              style={{
                margin: "10px 0 0",
                fontFamily: vana.font.sans,
                fontSize: 12,
                color: vana.color.muted,
              }}
            >
              Vana Naturals Pvt. Ltd., Coonoor, Tamil Nadu 643101, India
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
