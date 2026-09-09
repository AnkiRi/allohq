# Joon CRM development store

Joon's landing-page signup uses Joon's own hosted-form infrastructure. The permanent internal list belongs to a dedicated Shopify development store in the same Partner organization as the Joon app.

## Founder steps in Shopify Partners

1. Open the Joon Partner organization and create a development store named `joon-crm`.
2. Choose a store intended for app development. Do not enable transfer to a merchant.
3. Install the current Joon app version on that store.
4. Complete the Shopify-to-Clerk handoff and onboarding in Joon.
5. In Joon, create one hosted email signup form for the store:
   - Name: `Joon website interest`
   - Required email field
   - Required email-consent checkbox
   - No phone field and no incentive
   - Market: `global`, unless counsel selects another preset
   - Status: `active`
6. Copy the Joon database `Store.id` for this Shopify store. This is not the Shopify numeric shop ID or the `.myshopify.com` domain.
7. Set `JOON_CRM_STORE_ID` to that value in the Vercel production and preview environments.
8. Redeploy the web app. The landing route resolves the newest active form for that store automatically; no form ID belongs in source code or environment variables.

## Acceptance check

1. Open `/options/v3-landing` in an incognito window.
2. Submit a new address and tick the consent checkbox.
3. Confirm the page reports that a confirmation email was sent.
4. Open the email and use the single-use confirmation link.
5. In the Joon CRM store, confirm the customer, form submission, consent evidence and confirmed email consent exist.
6. Submit the same address again and confirm the flow remains idempotent and does not create a duplicate customer.

If `JOON_CRM_STORE_ID` is missing, invalid, or has no active form, the landing page remains available and shows a disabled signup state.
