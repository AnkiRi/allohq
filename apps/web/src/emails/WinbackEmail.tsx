import * as React from "react";
import { Column, Hr, Img, Row, Section, Text } from "@react-email/components";
import { vana } from "./brand-kit";
import { VanaLayout } from "./VanaLayout";
import { VanaButton, VanaEyebrow, VanaHeading, VanaText } from "./components";

export type WinbackEmailProps = {
  firstName?: string;
  lastProductName?: string;
  lastOrderMonth?: string; // e.g. "October"
  reorderUrl?: string;
};

/**
 * Email 1 — Win-back (lapsed customer).
 * Warm, no discount. Acknowledge the time, remind them of what they loved,
 * one gentle CTA. Calm and human.
 */
export function WinbackEmail({
  firstName = "Aanya",
  lastProductName = "Ashwagandha Calm",
  lastOrderMonth = "October",
  reorderUrl = `${vana.url}/account/reorder`,
}: WinbackEmailProps) {
  return (
    <VanaLayout preview={`A quiet hello, ${firstName} — your evenings, remembered.`}>
      {/* Hero band — soft sand wash, serif headline */}
      <Section
        style={{
          backgroundColor: vana.color.sand,
          padding: "40px 36px 34px",
        }}
        className="vana-pad"
      >
        <VanaEyebrow>It&apos;s been a little while</VanaEyebrow>
        <VanaHeading style={{ fontSize: 34, lineHeight: "40px" }}>
          We saved your spot, {firstName}.
        </VanaHeading>
      </Section>

      {/* Body */}
      <Section style={{ padding: "30px 36px 8px" }} className="vana-pad">
        <VanaText>
          The last time we packed a parcel for you was back in {lastOrderMonth},
          and we&apos;ve thought of you since. No rush, no pressure — just a
          gentle note to say the door&apos;s still open whenever you&apos;re
          ready.
        </VanaText>
        <VanaText style={{ marginBottom: 0 }}>
          You came to us for {lastProductName} — the one so many people reach for
          when the evenings feel a little too loud. We still make it the same
          slow way: roots sun-dried, milled in small batches, nothing added that
          doesn&apos;t belong.
        </VanaText>
      </Section>

      {/* Product reminder card */}
      <Section style={{ padding: "24px 36px 8px" }} className="vana-pad">
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
            <td width={132} valign="top" style={{ padding: 0 }}>
              <Img
                src="https://picsum.photos/seed/vana-ashwagandha-amber-jar/264/264"
                width={132}
                height={132}
                alt="Ashwagandha Calm — amber glass jar"
                style={{ display: "block", width: 132, height: 132 }}
              />
            </td>
            <td valign="middle" style={{ padding: "18px 20px" }}>
              <Text
                className="vana-ink"
                style={{
                  margin: "0 0 4px",
                  fontFamily: vana.font.serif,
                  fontSize: 18,
                  lineHeight: "24px",
                  color: vana.color.ink,
                }}
              >
                {lastProductName}
              </Text>
              <Text
                className="vana-body"
                style={{
                  margin: 0,
                  fontFamily: vana.font.sans,
                  fontSize: 14,
                  lineHeight: "21px",
                  color: vana.color.body,
                }}
              >
                Roots, rest, and a steadier evening. The one you reordered twice.
              </Text>
            </td>
          </tr>
        </table>
      </Section>

      {/* CTA */}
      <Section style={{ padding: "26px 36px 6px" }} className="vana-pad">
        <VanaButton href={reorderUrl}>Pick up where you left off</VanaButton>
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
          Your past order is ready to repeat in a tap — same blend, same
          doorstep.
        </Text>
      </Section>

      <Section style={{ padding: "22px 36px 36px" }} className="vana-pad">
        <Hr
          className="vana-card-border"
          style={{
            borderColor: vana.color.sandLine,
            borderTop: `1px solid ${vana.color.sandLine}`,
            margin: "0 0 18px",
          }}
        />
        <Row>
          <Column className="vana-stack" valign="top">
            <Text
              className="vana-ink"
              style={{
                margin: "0 0 2px",
                fontFamily: vana.font.sans,
                fontSize: 14,
                fontWeight: 600,
                color: vana.color.ink,
              }}
            >
              A small note from us
            </Text>
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
              If something wasn&apos;t right last time, just reply to this
              email — a real person reads every one.
            </Text>
          </Column>
        </Row>
      </Section>
    </VanaLayout>
  );
}

export default WinbackEmail;
