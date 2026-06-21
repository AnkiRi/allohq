import * as React from "react";
import { Column, Hr, Img, Row, Section, Text } from "@react-email/components";
import { vana, formatINR } from "./brand-kit";
import { VanaLayout } from "./VanaLayout";
import { VanaButton, VanaEyebrow, VanaHeading, VanaText } from "./components";

export type ReplenishmentEmailProps = {
  firstName?: string;
  productName?: string;
  productBlurb?: string;
  price?: number;
  daysSupply?: number; // typical jar lasts N days
  reorderUrl?: string;
};

/**
 * Email 2 — Replenishment / post-purchase.
 * "Your [product] is probably running low." Helpful, one product, one CTA,
 * one usage tip. Warm and useful — not salesy.
 */
export function ReplenishmentEmail({
  firstName = "Aanya",
  productName = "Triphala Daily",
  productBlurb = "Three fruits, one steady ritual. Gentle digestive support, taken before bed.",
  price = 749,
  daysSupply = 60,
  reorderUrl = `${vana.url}/account/reorder?sku=triphala-daily`,
}: ReplenishmentEmailProps) {
  return (
    <VanaLayout
      preview={`A gentle nudge, ${firstName} — your ${productName} is winding down.`}
    >
      {/* Hero band */}
      <Section
        style={{ backgroundColor: vana.color.sand, padding: "40px 36px 34px" }}
        className="vana-pad"
      >
        <VanaEyebrow>A gentle reminder</VanaEyebrow>
        <VanaHeading style={{ fontSize: 34, lineHeight: "40px" }}>
          Your {productName} is probably running low.
        </VanaHeading>
      </Section>

      {/* Body */}
      <Section style={{ padding: "30px 36px 6px" }} className="vana-pad">
        <VanaText style={{ marginBottom: 0 }}>
          Hi {firstName} — by our count, you&apos;re about {daysSupply} days into
          your jar, which usually means the last few spoonfuls are in sight. We
          thought we&apos;d say something before it ran out, so your ritual
          doesn&apos;t skip a beat.
        </VanaText>
      </Section>

      {/* Product card with price */}
      <Section style={{ padding: "24px 36px 6px" }} className="vana-pad">
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          className="vana-card-border"
          style={{
            borderCollapse: "separate",
            border: `1px solid ${vana.color.sandLine}`,
            borderRadius: vana.radius.card,
            overflow: "hidden",
            backgroundColor: vana.color.paper,
          }}
        >
          <tr>
            <td width={140} valign="top" style={{ padding: 0 }}>
              <Img
                src="https://picsum.photos/seed/vana-triphala-amber-jar/280/300"
                width={140}
                height={150}
                alt={`${productName} — amber glass jar`}
                style={{ display: "block", width: 140, height: 150 }}
              />
            </td>
            <td valign="middle" style={{ padding: "18px 20px" }}>
              <Text
                className="vana-ink"
                style={{
                  margin: "0 0 4px",
                  fontFamily: vana.font.serif,
                  fontSize: 19,
                  lineHeight: "24px",
                  color: vana.color.ink,
                }}
              >
                {productName}
              </Text>
              <Text
                className="vana-body"
                style={{
                  margin: "0 0 10px",
                  fontFamily: vana.font.sans,
                  fontSize: 14,
                  lineHeight: "21px",
                  color: vana.color.body,
                }}
              >
                {productBlurb}
              </Text>
              <Text
                className="vana-ink"
                style={{
                  margin: 0,
                  fontFamily: vana.font.sans,
                  fontSize: 15,
                  fontWeight: 600,
                  color: vana.color.ink,
                }}
              >
                {formatINR(price)}{" "}
                <span
                  className="vana-muted"
                  style={{
                    fontWeight: 400,
                    fontSize: 13,
                    color: vana.color.muted,
                  }}
                >
                  · {daysSupply}-day jar
                </span>
              </Text>
            </td>
          </tr>
        </table>
      </Section>

      {/* CTA */}
      <Section style={{ padding: "24px 36px 6px" }} className="vana-pad">
        <VanaButton href={reorderUrl}>Reorder in one tap</VanaButton>
        <Text
          className="vana-muted"
          style={{
            margin: "16px 0 0",
            fontFamily: vana.font.sans,
            fontSize: 13,
            lineHeight: "20px",
            color: vana.color.muted,
          }}
        >
          Same jar, same address, free delivery over {formatINR(599)}. No
          subscription, no lock-in.
        </Text>
      </Section>

      {/* Usage tip — sand block */}
      <Section style={{ padding: "26px 36px 36px" }} className="vana-pad">
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderCollapse: "separate" }}
        >
          <tr>
            <td
              style={{
                backgroundColor: vana.color.sand,
                borderRadius: vana.radius.card,
                padding: "20px 22px",
              }}
            >
              <Row>
                <Column className="vana-stack" valign="top">
                  <Text
                    className="vana-ink"
                    style={{
                      margin: "0 0 6px",
                      fontFamily: vana.font.sans,
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: vana.color.primary,
                    }}
                  >
                    One small tip
                  </Text>
                  <Text
                    className="vana-body"
                    style={{
                      margin: 0,
                      fontFamily: vana.font.sans,
                      fontSize: 15,
                      lineHeight: "23px",
                      color: vana.color.body,
                    }}
                  >
                    Triphala settles best with warm water about an hour after
                    dinner. Keeping the jar by your kettle is the easiest way to
                    make it a habit you don&apos;t have to think about.
                  </Text>
                </Column>
              </Row>
            </td>
          </tr>
        </table>

        <Hr
          className="vana-card-border"
          style={{
            borderColor: vana.color.sandLine,
            borderTop: `1px solid ${vana.color.sandLine}`,
            margin: "24px 0 14px",
          }}
        />
        <Text
          className="vana-muted"
          style={{
            margin: 0,
            fontFamily: vana.font.sans,
            fontSize: 13,
            lineHeight: "20px",
            color: vana.color.muted,
          }}
        >
          Not quite out yet? No problem — this&apos;ll keep. Reply any time and
          we can nudge you again later.
        </Text>
      </Section>
    </VanaLayout>
  );
}

export default ReplenishmentEmail;
