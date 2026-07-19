# Razorpay website review and launch

Production website: `https://micro-manus-naman-web.vercel.app`

## Website review form

- Where payments are accepted: **Website**
- Website URL: `https://micro-manus-naman-web.vercel.app/`
- Login required to complete payment: **Yes**
- Reviewer sign-in URL: `https://micro-manus-naman-web.vercel.app/sign-in?next=/subscribe`
- Test account: use a dedicated ordinary Supabase email/password user. Never provide Google, GitHub, Supabase Dashboard, Razorpay Dashboard, or personal account credentials.

The review account should be email-confirmed and should not have an entitlement or credits. That lets the reviewer sign in and reach the real Razorpay checkout without receiving admin access.

## Public review pages

- Pricing: `/pricing`
- Terms and Conditions: `/terms`
- Privacy Policy: `/privacy`
- Cancellation and Refund Policy: `/refund-policy`
- Shipping and Delivery Policy: `/shipping-policy`
- Contact Us: `/contact`

All pages are linked from the public site footer and included in `sitemap.xml`. Before submitting the site, confirm that the merchant name and refund terms match the Razorpay KYC details and the policy the business will actually honour.

## Supabase

1. In **Authentication → Providers → Email**, enable email/password sign-in.
2. Create one dedicated reviewer user under **Authentication → Users**.
3. Mark the email as confirmed. Do not grant an entitlement and do not redeem a coupon on this account.
4. Test the account at `/sign-in?next=/subscribe` in an incognito window.
5. Rotate the password or delete the account after Razorpay finishes reviewing the website.

## Vercel environment

Set these public business details for Production and Preview, then redeploy:

```text
NEXT_PUBLIC_BUSINESS_NAME=MicroManus
NEXT_PUBLIC_SUPPORT_EMAIL=<public support email>
NEXT_PUBLIC_SUPPORT_URL=https://github.com/namanxdev/MicroManus-Naman/issues
NEXT_PUBLIC_OPERATING_COUNTRY=India
```

`NEXT_PUBLIC_SUPPORT_EMAIL` is intentionally not committed with a personal address. Use an inbox that can receive customer, refund, and privacy requests.

## Razorpay integration

1. Use Test Mode keys while testing and Live Mode keys only after KYC and website approval.
2. Configure automatic capture.
3. Add the webhook URL:

   `https://micro-manus-naman-web.vercel.app/api/billing/webhook`

4. Subscribe to `order.paid` and optionally `payment.captured`. Database idempotency prevents the same payment from granting credits twice.
5. Store the webhook secret in Vercel as `RAZORPAY_WEBHOOK_SECRET`; it must not be the API key secret.
6. Keep the advertised price consistent with `RAZORPAY_AMOUNT_SUBUNITS` and `RAZORPAY_CURRENCY`. An Indian merchant account needs International Payments enabled to charge USD.

## Final test

1. Open an incognito window and visit the production reviewer sign-in URL.
2. Sign in with the dedicated review account.
3. Confirm the page displays the same amount and currency as `/pricing`.
4. Complete one Razorpay test payment and verify exactly five credits are granted.
5. Refresh the page and confirm the payment is not applied twice.
6. Open every public policy link and verify the support channel works.
