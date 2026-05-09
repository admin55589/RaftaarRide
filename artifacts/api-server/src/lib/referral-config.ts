/* Shared in-memory referral program configuration.
   Imported by both auth.ts (apply bonus logic) and admin.ts (config endpoints).
   Resets to defaults on server restart — move to DB for persistence in production. */

export const referralConfig = {
  enabled: true,
  bonusAmount: 50,   /* ₹ credited to both referrer + new user */
};
