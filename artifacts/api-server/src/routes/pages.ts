import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const HTML_SHELL = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — RaftaarRide</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0A0A0F;color:#E0E0E8;min-height:100vh;padding:0}
    .header{background:linear-gradient(135deg,#1A1A2E 0%,#16161E 100%);border-bottom:1px solid #2A2A38;padding:20px 24px;display:flex;align-items:center;gap:14px;position:sticky;top:0;z-index:10}
    .logo-box{background:#F5A623;border-radius:12px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#0A0A0F;flex-shrink:0}
    .brand{font-size:20px;font-weight:700;color:#fff}
    .brand span{color:#F5A623}
    .container{max-width:820px;margin:0 auto;padding:40px 24px 80px}
    h1{font-size:28px;font-weight:800;color:#fff;margin-bottom:6px}
    .meta{font-size:13px;color:#8A8A9A;margin-bottom:36px;border-bottom:1px solid #2A2A38;padding-bottom:20px}
    h2{font-size:17px;font-weight:700;color:#F5A623;margin:32px 0 10px;padding-top:4px}
    p{font-size:15px;line-height:1.75;color:#C0C0D0;margin-bottom:12px}
    ul{padding-left:20px;margin-bottom:14px}
    li{font-size:15px;line-height:1.75;color:#C0C0D0;margin-bottom:4px}
    a{color:#F5A623;text-decoration:none}
    a:hover{text-decoration:underline}
    .contact-box{background:#16161E;border:1px solid #2A2A38;border-radius:14px;padding:20px 22px;margin-top:36px}
    .contact-box p{margin:0;font-size:14px;color:#8A8A9A}
    .contact-box strong{color:#fff}
    .footer{text-align:center;font-size:13px;color:#8A8A9A;margin-top:48px;padding-top:20px;border-top:1px solid #2A2A38}
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-box">R</div>
    <div class="brand">Raftaar<span>Ride</span></div>
  </div>
  <div class="container">
    ${body}
    <div class="footer">© ${new Date().getFullYear()} RaftaarRide. All rights reserved.</div>
  </div>
</body>
</html>`;

/* ─── Terms of Service ─────────────────────────────────── */
router.get("/terms", (_req: Request, res: Response) => {
  const body = `
    <h1>Terms of Service</h1>
    <p class="meta">Effective Date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} &nbsp;|&nbsp; Last Updated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>

    <p>Welcome to <strong>RaftaarRide</strong>. By downloading, registering, or using our mobile application and related services, you agree to be bound by these Terms of Service ("Terms"). Please read them carefully before using the Platform.</p>

    <h2>1. About RaftaarRide</h2>
    <p>RaftaarRide is a technology platform that connects passengers ("Users") with independent driver-partners ("Drivers") for transportation services. RaftaarRide does not itself provide transportation services; it acts solely as a technology intermediary. Our pricing is designed to be <strong>14–17% more affordable</strong> than comparable platforms.</p>

    <h2>2. Eligibility</h2>
    <ul>
      <li>You must be at least <strong>18 years of age</strong> to use RaftaarRide.</li>
      <li>You must possess a valid mobile phone number capable of receiving OTPs.</li>
      <li>Drivers must hold a valid driving licence and comply with all applicable motor vehicle regulations in India.</li>
      <li>By using the Platform, you represent that the information you provide is accurate and complete.</li>
    </ul>

    <h2>3. Account Registration &amp; Security</h2>
    <p>Access to RaftaarRide requires OTP-based phone verification or email/social login. You are responsible for maintaining the confidentiality of your account. You must notify us immediately at <a href="mailto:support@raftaarride.in">support@raftaarride.in</a> if you suspect any unauthorised use of your account.</p>

    <h2>4. Ride Booking &amp; Cancellation</h2>
    <ul>
      <li>Users may book rides instantly or schedule them in advance.</li>
      <li>Cancellations made after a Driver has accepted a ride may attract a cancellation fee as communicated in the app at the time of booking.</li>
      <li>RaftaarRide reserves the right to cancel a ride if fraudulent activity or policy violations are detected.</li>
    </ul>

    <h2>5. Fares &amp; Payments</h2>
    <ul>
      <li>Fares are calculated based on distance, vehicle type, demand, and applicable surcharges displayed in the app before confirmation.</li>
      <li>Payments can be made via cash, UPI, or other supported digital payment methods.</li>
      <li>A platform commission of <strong>6.7%</strong> is charged on each completed ride, deducted from the Driver's earnings.</li>
      <li>All digital transactions are processed securely through <strong>Razorpay</strong>. RaftaarRide does not store card or bank details.</li>
    </ul>

    <h2>6. Driver Earnings &amp; Withdrawals</h2>
    <ul>
      <li>Drivers can withdraw their accumulated earnings to a UPI ID, PhonePe number, or linked bank account.</li>
      <li>Withdrawal requests are processed automatically. Valid payment details result in immediate payout; invalid details are auto-rejected with a wallet refund.</li>
      <li>Minimum withdrawal amount and processing timelines are displayed in the Driver app at the time of the request.</li>
    </ul>

    <h2>7. User Conduct</h2>
    <p>You agree not to:</p>
    <ul>
      <li>Use the Platform for any unlawful purpose or in violation of any local, state, or national law.</li>
      <li>Harass, threaten, or harm any Driver, User, or RaftaarRide employee.</li>
      <li>Provide false personal information or create accounts fraudulently.</li>
      <li>Attempt to reverse-engineer, copy, or disrupt the Platform or its technology.</li>
    </ul>

    <h2>8. Safety &amp; SOS</h2>
    <p>RaftaarRide provides an in-app <strong>SOS feature</strong> to alert emergency contacts during a ride. This feature is provided as a convenience and does not replace official emergency services. Please call <strong>112</strong> for emergencies requiring immediate police, fire, or medical assistance.</p>

    <h2>9. Location Services</h2>
    <p>The Platform requires access to your device's location to provide ride-matching and navigation features. Location data is collected in accordance with our Privacy Policy and is not sold to third parties.</p>

    <h2>10. Intellectual Property</h2>
    <p>All content, trademarks, logos, and software comprising the RaftaarRide Platform are the exclusive property of RaftaarRide and are protected under applicable intellectual property laws. You may not copy, distribute, or create derivative works without prior written consent.</p>

    <h2>11. Disclaimers &amp; Limitation of Liability</h2>
    <p>The Platform is provided on an "as is" and "as available" basis. RaftaarRide makes no warranties, express or implied, regarding the reliability or availability of the service. To the maximum extent permitted by law, RaftaarRide's liability for any claim arising from use of the Platform shall not exceed the amount paid by you for the specific ride giving rise to the claim.</p>

    <h2>12. Indemnification</h2>
    <p>You agree to indemnify and hold harmless RaftaarRide, its officers, directors, employees, and agents from any claims, damages, or expenses (including legal fees) arising from your use of the Platform or violation of these Terms.</p>

    <h2>13. Governing Law &amp; Dispute Resolution</h2>
    <p>These Terms are governed by the laws of <strong>India</strong>. Any disputes shall be resolved by binding arbitration in accordance with the Arbitration and Conciliation Act, 1996, or by courts of competent jurisdiction in India.</p>

    <h2>14. Modifications</h2>
    <p>RaftaarRide reserves the right to update these Terms at any time. Continued use of the Platform after changes constitutes acceptance of the revised Terms. We will notify registered users of material changes via app notification or email.</p>

    <h2>15. Contact Us</h2>
    <div class="contact-box">
      <p><strong>RaftaarRide Support</strong></p>
      <p>Email: <a href="mailto:support@raftaarride.in">support@raftaarride.in</a></p>
      <p>For grievances under the Information Technology Act, 2000, please write to the Grievance Officer at the above email address.</p>
    </div>
  `;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(HTML_SHELL("Terms of Service", body));
});

/* ─── Privacy Policy ───────────────────────────────────── */
router.get("/privacy", (_req: Request, res: Response) => {
  const body = `
    <h1>Privacy Policy</h1>
    <p class="meta">Effective Date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} &nbsp;|&nbsp; Last Updated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>

    <p>RaftaarRide ("we", "our", or "us") is committed to protecting your personal information and your right to privacy. This Privacy Policy explains what information we collect, how we use it, and your rights in relation to it.</p>

    <h2>1. Information We Collect</h2>
    <p><strong>a) Information You Provide:</strong></p>
    <ul>
      <li><strong>Account Information:</strong> Name, mobile phone number, and email address provided during registration.</li>
      <li><strong>Driver Information:</strong> Driving licence number, vehicle registration, bank/UPI details for payment processing, and KYC documents.</li>
      <li><strong>Payment Information:</strong> UPI IDs, PhonePe numbers, or bank account details for payouts (Drivers only). We do not store card numbers; payments are handled by <strong>Razorpay</strong> under its own privacy and security standards.</li>
      <li><strong>Communications:</strong> Messages, ratings, or feedback you submit through the app.</li>
    </ul>
    <p><strong>b) Information Collected Automatically:</strong></p>
    <ul>
      <li><strong>Location Data:</strong> Real-time GPS location during active ride sessions to facilitate matching, navigation, and safety features. We request location permission explicitly before collection.</li>
      <li><strong>Device Information:</strong> Device model, operating system, unique device identifiers, and app version for technical support and crash reporting.</li>
      <li><strong>Usage Data:</strong> Ride history, search queries, and in-app interactions to improve the service.</li>
    </ul>

    <h2>2. How We Use Your Information</h2>
    <ul>
      <li>To create and manage your account and authenticate via OTP.</li>
      <li>To match Users with nearby Drivers and provide ride services.</li>
      <li>To process payments and Driver payouts securely via Razorpay.</li>
      <li>To send ride confirmations, OTP messages, and service notifications via SMS.</li>
      <li>To resolve disputes, enforce our Terms of Service, and prevent fraud.</li>
      <li>To analyse usage patterns and improve the Platform experience.</li>
      <li>To comply with applicable Indian laws and regulations.</li>
    </ul>

    <h2>3. Location Data</h2>
    <p>We collect your precise location only during active rides or when you grant permission during onboarding. Location data is used solely for ride matching, route calculation, and safety purposes. We do not sell your location data to third-party advertisers.</p>

    <h2>4. Sharing of Information</h2>
    <p>We share your information only in the following circumstances:</p>
    <ul>
      <li><strong>With Drivers/Users:</strong> Your name and pickup location are shared with the matched Driver (or Driver details shared with the User) for the purpose of completing the ride.</li>
      <li><strong>Service Providers:</strong> We work with trusted third parties such as Razorpay (payments), Fast2SMS / Firebase (OTP delivery), and Mapbox (mapping). Each provider has its own privacy policy.</li>
      <li><strong>Legal Requirements:</strong> We may disclose information when required by law, court order, or government authority in India.</li>
      <li><strong>Business Transfer:</strong> In the event of a merger or acquisition, user data may be transferred as a business asset.</li>
    </ul>
    <p>We do <strong>not</strong> sell your personal data to third parties.</p>

    <h2>5. Data Retention</h2>
    <p>We retain your account data for as long as your account is active or as required by applicable law. Ride records may be retained for up to <strong>3 years</strong> for dispute resolution and legal compliance. You may request deletion of your account and associated data by contacting us.</p>

    <h2>6. Security</h2>
    <p>We implement industry-standard security measures including HTTPS encryption, OTP-based authentication, and access controls. However, no transmission over the internet is 100% secure. We encourage you to use a strong, unique password and to report any suspected security breach immediately.</p>

    <h2>7. Children's Privacy</h2>
    <p>RaftaarRide is not intended for use by persons under the age of 18. We do not knowingly collect personal data from minors. If we become aware that we have collected data from a child, we will delete it promptly.</p>

    <h2>8. Your Rights</h2>
    <p>Under applicable Indian law (including the Digital Personal Data Protection Act, 2023), you have the right to:</p>
    <ul>
      <li>Access the personal data we hold about you.</li>
      <li>Correct inaccurate or incomplete data.</li>
      <li>Request deletion of your data, subject to legal obligations.</li>
      <li>Withdraw consent for data processing (this may affect your ability to use certain features).</li>
      <li>Nominate a person to exercise these rights on your behalf.</li>
    </ul>
    <p>To exercise any of these rights, please contact us at <a href="mailto:privacy@raftaarride.in">privacy@raftaarride.in</a>.</p>

    <h2>9. Cookies &amp; Tracking</h2>
    <p>Our mobile application does not use browser cookies. We may use device-level identifiers for analytics purposes only. You can reset your advertising identifier through your device settings at any time.</p>

    <h2>10. Third-Party Links</h2>
    <p>The app may contain links to third-party services (e.g., payment gateways). We are not responsible for the privacy practices of those services. Please review their policies separately.</p>

    <h2>11. Changes to This Policy</h2>
    <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via in-app notification or SMS. Your continued use of the Platform after updates constitutes your acceptance of the revised policy.</p>

    <h2>12. Grievance Officer</h2>
    <div class="contact-box">
      <p><strong>Grievance Officer — RaftaarRide</strong></p>
      <p>In accordance with the Information Technology Act, 2000 and the rules made thereunder, the name and contact details of the Grievance Officer are:</p>
      <p style="margin-top:10px"><strong>Email:</strong> <a href="mailto:grievance@raftaarride.in">grievance@raftaarride.in</a></p>
      <p>We will respond to grievances within <strong>30 days</strong> of receipt.</p>
    </div>
  `;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(HTML_SHELL("Privacy Policy", body));
});

export default router;
