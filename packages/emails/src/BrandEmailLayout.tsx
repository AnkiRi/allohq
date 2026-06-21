import * as React from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { BrandKit } from "./brand-kit";

type BrandEmailLayoutProps = {
  brandKit: BrandKit;
  /** Inbox preview text (the dim line after the subject). */
  preview: string;
  children: React.ReactNode;
};

/**
 * Shared identity shell for every generated email: <head> defaults, the
 * brand header (logo or wordmark pill), the content card, and the footer.
 * Driven entirely by the BrandKit so every brand's emails inherit one
 * consistent, calm, premium look.
 *
 * Dark-mode-safe:
 *  - color-scheme + supported-color-schemes meta tells clients we handle both.
 *  - the wordmark sits on a brand pill, not transparent — it never vanishes
 *    when Gmail/Apple invert a light layout.
 *  - borders use a hairline that survives dark inversion.
 *  - mobile-first: fluid single column, fluid heading sizes.
 */
export function BrandEmailLayout({ brandKit, preview, children }: BrandEmailLayoutProps) {
  const { colors, fonts, logo, voice, footer } = brandKit;

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
              a { color: ${colors.secondary}; }
              img { max-width: 100%; }
              @media (prefers-color-scheme: dark) {
                .bk-paper { background-color: #14150F !important; }
                .bk-surface { background-color: #1C1E16 !important; }
                .bk-ink { color: ${colors.paper} !important; }
                .bk-body { color: #D7D4C7 !important; }
                .bk-muted { color: #9C9A8B !important; }
                .bk-line { border-color: #2F3326 !important; }
                .bk-accent { background-color: #20231A !important; }
              }
              @media only screen and (max-width: 600px) {
                .bk-pad { padding-left: 22px !important; padding-right: 22px !important; }
                .bk-h1 { font-size: 28px !important; line-height: 34px !important; }
                .bk-stack { display: block !important; width: 100% !important; }
                .bk-stack-img { width: 100% !important; height: auto !important; }
              }
            `,
          }}
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        className="bk-paper"
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: colors.paper,
          fontFamily: fonts.sans,
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <Container
          style={{
            width: "100%",
            maxWidth: brandKit.contentWidth,
            margin: "0 auto",
            padding: "0",
          }}
        >
          {/* Header — logo image if present, else a wordmark on a brand pill
              so the brand survives dark mode. */}
          <Section style={{ padding: "28px 28px 8px" }} className="bk-pad">
            {logo.src ? (
              <Img
                src={logo.src}
                alt={logo.alt}
                height={36}
                style={{ display: "block", height: 36, width: "auto", border: 0 }}
              />
            ) : (
              <table
                role="presentation"
                cellPadding={0}
                cellSpacing={0}
                style={{ borderCollapse: "collapse" }}
              >
                <tr>
                  <td
                    style={{
                      backgroundColor: colors.primary,
                      borderRadius: 999,
                      padding: "8px 18px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: fonts.serif,
                        fontSize: 19,
                        letterSpacing: "0.04em",
                        fontWeight: 600,
                        color: colors.onPrimary,
                      }}
                    >
                      {logo.wordmark}
                    </span>
                    {logo.descriptor ? (
                      <span
                        style={{
                          fontFamily: fonts.sans,
                          fontSize: 11,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          color: colors.onPrimaryMuted,
                          marginLeft: 8,
                        }}
                      >
                        {logo.descriptor}
                      </span>
                    ) : null}
                  </td>
                </tr>
              </table>
            )}
          </Section>

          {/* Email body card */}
          <Section
            className="bk-surface bk-line"
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.line}`,
              borderRadius: brandKit.radius.card,
              margin: "12px 0 0",
              overflow: "hidden",
            }}
          >
            {children}
          </Section>

          {/* Footer */}
          <Section style={{ padding: "26px 28px 40px" }} className="bk-pad">
            <Text
              className="bk-ink"
              style={{
                margin: "0 0 4px",
                fontFamily: fonts.serif,
                fontSize: 16,
                color: colors.ink,
              }}
            >
              {voice.brandName}
            </Text>
            {voice.tagline ? (
              <Text
                className="bk-muted"
                style={{
                  margin: "0 0 14px",
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  lineHeight: "20px",
                  color: colors.muted,
                }}
              >
                {voice.tagline}
              </Text>
            ) : null}

            {footer.socialLinks && footer.socialLinks.length > 0 ? (
              <Text
                className="bk-muted"
                style={{
                  margin: "0 0 14px",
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  color: colors.muted,
                }}
              >
                {footer.socialLinks.map((l, i) => (
                  <React.Fragment key={l.platform}>
                    {i > 0 ? "  ·  " : ""}
                    <Link href={l.url} style={{ color: colors.secondary }}>
                      {l.platform}
                    </Link>
                  </React.Fragment>
                ))}
              </Text>
            ) : null}

            <Hr
              className="bk-line"
              style={{
                borderColor: colors.line,
                borderTop: `1px solid ${colors.line}`,
                margin: "0 0 14px",
              }}
            />
            <Text
              className="bk-muted"
              style={{
                margin: 0,
                fontFamily: fonts.sans,
                fontSize: 12,
                lineHeight: "18px",
                color: colors.muted,
              }}
            >
              You&apos;re receiving this because you&apos;re a {voice.brandName}{" "}
              customer.{" "}
              {footer.preferencesUrl ? (
                <>
                  <Link href={footer.preferencesUrl} style={{ color: colors.secondary }}>
                    Email preferences
                  </Link>{" "}
                  ·{" "}
                </>
              ) : null}
              <Link
                href={footer.unsubscribeUrl ?? "{{unsubscribe_url}}"}
                style={{ color: colors.secondary }}
              >
                Unsubscribe
              </Link>
            </Text>
            {footer.customText ? (
              <Text
                className="bk-muted"
                style={{
                  margin: "10px 0 0",
                  fontFamily: fonts.sans,
                  fontSize: 12,
                  lineHeight: "18px",
                  color: colors.muted,
                }}
              >
                {footer.customText}
              </Text>
            ) : null}
            {footer.address ? (
              <Text
                className="bk-muted"
                style={{
                  margin: "6px 0 0",
                  fontFamily: fonts.sans,
                  fontSize: 12,
                  color: colors.muted,
                }}
              >
                {footer.address}
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
