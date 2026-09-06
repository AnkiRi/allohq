# Global acquisition consent architecture

## Product boundary

Joon may collect email and international phone numbers before every delivery channel is enabled. Collection never enables delivery. Email and SMS have independent consent records, independent suppression, and independent future activation gates.

## Evidence captured

Each form consent records the customer and channel, status, source, collection time, form and popup identifiers, disclosure version, configured market, storefront locale and privacy-policy URL. The submitted disclosure text remains in the versioned form definition and the submission ledger. Phone numbers are accepted only in E.164 international form.

## Safe defaults

- Consent controls are unchecked and channel-specific.
- Email signup remains possible when SMS is declined.
- A phone number cannot be submitted without explicit SMS consent.
- Consent is not treated as a condition of purchase.
- Withdrawal is channel-specific; complaints and hard bounces cannot be reversed by a form.
- SMS delivery remains fail-closed until provider, sender, quiet-hours, opt-out and jurisdictional readiness are enabled.
- Merchants must add phone access to Shopify protected-customer-data approval before public phone collection.

## Market configuration

The form stores a primary market (`global`, `eu_uk`, `us`, `canada`, or `australia`) and a merchant-editable-free disclosure version. Market configuration selects conservative product guidance and evidence labels; it is not automated legal advice. The merchant remains responsible for its lawful basis, audience and offer, while Joon provides processor controls, auditability, export/deletion, suppression and delivery enforcement.

Authoritative references reviewed:

- EU GDPR: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- UK ICO electronic-mail marketing guidance: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/
- Canada anti-spam legislation guidance: https://ised-isde.canada.ca/site/canada-anti-spam-legislation/en/getting-consent-send-email
- Australian Communications and Media Authority spam guidance: https://www.acma.gov.au/avoid-sending-spam

## Still required before SMS delivery

Provider integration, sender registration where applicable, STOP/help processing, quiet hours by recipient location, content classification, country-specific age/restricted-product controls, confirmation flows where selected, and external legal review of default disclosures. None of these block building a consented SMS audience; all block sending SMS.
