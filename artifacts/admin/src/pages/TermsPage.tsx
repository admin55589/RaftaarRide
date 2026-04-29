export function TermsPage() {
  return (
    <div style={{ margin: 0, padding: 0, background: "#0A0A0F", minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: "#C8C8D8", WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        *{box-sizing:border-box}
        .pp-header{background:linear-gradient(135deg,#0E0E18,#12121C);border-bottom:1px solid #1E1E2E;padding:16px 24px;display:flex;align-items:center;gap:14px;position:sticky;top:0;z-index:100}
        .pp-logo{width:44px;height:44px;background:linear-gradient(135deg,#F5A623,#E09010);border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#0A0A0F;flex-shrink:0;box-shadow:0 4px 16px rgba(245,166,35,.3)}
        .pp-brand{font-size:20px;font-weight:800;color:#fff}
        .pp-badge{margin-left:auto;background:rgba(245,166,35,.12);border:1px solid rgba(245,166,35,.25);color:#F5A623;font-size:11px;font-weight:700;padding:4px 10px;border-radius:100px;letter-spacing:.5px;text-transform:uppercase}
        .pp-hero{background:linear-gradient(135deg,#0E0E18 0%,#12121C 60%,#0A0A0F 100%);padding:48px 24px 40px;text-align:center;border-bottom:1px solid #1E1E2E}
        .pp-icon{width:72px;height:72px;background:linear-gradient(135deg,rgba(245,166,35,.15),rgba(245,166,35,.05));border:1.5px solid rgba(245,166,35,.3);border-radius:22px;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 20px;box-shadow:0 8px 32px rgba(245,166,35,.12)}
        .pp-h1{font-size:clamp(26px,5vw,36px);font-weight:900;color:#fff;margin-bottom:10px;letter-spacing:-.5px}
        .pp-meta{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.04);border:1px solid #1E1E2E;border-radius:100px;padding:6px 16px;font-size:13px;color:#8A8A9A;margin-top:8px}
        .pp-meta span{color:#F5A623;font-weight:600}
        .pp-tabs{display:flex;max-width:500px;margin:24px auto 0;background:rgba(255,255,255,.04);border:1px solid #1E1E2E;border-radius:14px;padding:4px;gap:4px}
        .pp-tab{flex:1;text-align:center;padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;color:#8A8A9A;transition:all .2s;cursor:pointer;border:none;background:transparent}
        .pp-tab.active{background:linear-gradient(135deg,#F5A623,#E09010);color:#0A0A0F}
        .pp-container{max-width:780px;margin:0 auto;padding:40px 20px 80px}
        .pp-card{background:#111118;border:1px solid #1E1E2E;border-radius:18px;padding:24px;margin-bottom:16px;transition:border-color .2s}
        .pp-card:hover{border-color:rgba(245,166,35,.2)}
        .pp-card-head{display:flex;align-items:flex-start;gap:14px;margin-bottom:14px}
        .pp-num{min-width:36px;height:36px;background:linear-gradient(135deg,#F5A623,#E09010);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#0A0A0F;flex-shrink:0;margin-top:2px}
        .pp-title{font-size:17px;font-weight:700;color:#fff;line-height:1.3}
        .pp-body{font-size:15px;line-height:1.8;color:#C8C8D8}
        .pp-list{list-style:none;padding:0;margin-top:8px;display:flex;flex-direction:column;gap:8px}
        .pp-list li{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);border-radius:10px;font-size:14px;line-height:1.6}
        .pp-list li::before{content:'→';color:#F5A623;font-weight:700;flex-shrink:0;margin-top:1px}
        .pp-contact{background:linear-gradient(135deg,rgba(245,166,35,.08),rgba(245,166,35,.03));border:1px solid rgba(245,166,35,.25);border-radius:18px;padding:24px;margin-top:24px;display:flex;align-items:center;gap:16px}
        .pp-cicon{width:48px;height:48px;background:rgba(245,166,35,.15);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
        .pp-contact h3{font-size:15px;font-weight:700;color:#fff;margin-bottom:4px}
        .pp-contact p{font-size:13px;color:#8A8A9A;line-height:1.5}
        .pp-contact a{color:#F5A623;text-decoration:none;font-weight:600}
        .pp-footer{text-align:center;padding:32px 24px;border-top:1px solid #1E1E2E;font-size:13px;color:#8A8A9A}
        .pp-footer a{color:#F5A623;text-decoration:none;margin:0 8px}
        @media(max-width:600px){.pp-hero{padding:36px 16px 32px}.pp-container{padding:24px 14px 60px}.pp-card{padding:18px 16px}.pp-contact{flex-direction:column;align-items:flex-start}.pp-tabs{margin:20px 16px 0}}
      `}</style>

      <header className="pp-header">
        <div className="pp-logo">R</div>
        <div className="pp-brand">Raftaar<span style={{ color: "#F5A623" }}>Ride</span></div>
        <div className="pp-badge">Legal</div>
      </header>

      <div className="pp-hero">
        <div className="pp-icon">📋</div>
        <h1 className="pp-h1">Terms &amp; Conditions</h1>
        <div className="pp-meta">Effective Date: <span>20 April 2025</span></div>
        <div className="pp-tabs">
          <button className="pp-tab active">📋 Terms of Service</button>
          <button className="pp-tab" onClick={() => window.location.href = "/privacy"}>🔒 Privacy Policy</button>
        </div>
      </div>

      <div className="pp-container">
        {[
          { n: "01", title: "Service Overview", body: <><p>Welcome to <strong style={{ color: "#fff" }}>RaftaarRide</strong>. By using our mobile application, you agree to the following terms.</p><br /><p>RaftaarRide is a platform that connects riders (customers) with independent drivers for transportation services such as bike, auto, and cab rides.</p></> },
          { n: "02", title: "User Eligibility", body: <ul className="pp-list"><li>You must be at least 18 years old.</li><li>You must provide accurate personal information.</li><li>You are responsible for maintaining account security.</li></ul> },
          { n: "03", title: "Booking & Payments", body: <ul className="pp-list"><li>Ride fares are calculated based on distance, time, and demand.</li><li>Payments can be made via cash or online modes.</li><li>Cancellation charges may apply.</li></ul> },
          { n: "04", title: "Driver Responsibility", body: <p>Drivers are independent partners, not employees. RaftaarRide is not responsible for driver behavior but will take strict action on complaints.</p> },
          { n: "05", title: "User Conduct", body: <><p style={{ marginBottom: 10 }}>You agree <strong style={{ color: "#fff" }}>NOT</strong> to:</p><ul className="pp-list"><li>Misuse the app</li><li>Provide false bookings</li><li>Harass drivers or customers</li></ul></> },
          { n: "06", title: "Cancellations & Refunds", body: <ul className="pp-list"><li>Cancellation charges may apply after booking confirmation.</li><li>Refunds (if applicable) will be processed within 5–7 working days.</li></ul> },
          { n: "07", title: "Limitation of Liability", body: <><p style={{ marginBottom: 10 }}>RaftaarRide is a technology platform and is not liable for:</p><ul className="pp-list"><li>Delays in rides</li><li>Accidents or damages</li><li>Driver misconduct (though complaints are handled seriously)</li></ul></> },
          { n: "08", title: "Account Suspension", body: <><p style={{ marginBottom: 10 }}>We reserve the right to suspend or terminate accounts for:</p><ul className="pp-list"><li>Fraudulent activity</li><li>Misconduct</li><li>Violation of terms</li></ul></> },
          { n: "09", title: "Changes to Terms", body: <p>RaftaarRide may update these terms anytime. Continued use means acceptance of changes.</p> },
        ].map(({ n, title, body }) => (
          <div key={n} className="pp-card">
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "14px", marginBottom: "14px" }}>
              <div style={{ minWidth: "36px", width: "36px", height: "36px", background: "linear-gradient(135deg,#F5A623,#E09010)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 900, color: "#0A0A0F", flexShrink: 0 }}>{n}</div>
              <div style={{ fontSize: "17px", fontWeight: 700, color: "#F5A623", lineHeight: 1.3, flex: 1 }}>{title}</div>
            </div>
            <div className="pp-body">{body}</div>
          </div>
        ))}

        <div className="pp-contact">
          <div className="pp-cicon">✉️</div>
          <div>
            <h3>Contact Us</h3>
            <p>For any questions or support, reach us at <a href="https://mail.google.com/mail/?view=cm&fs=1&to=admin.raftaarride@gmail.com" target="_blank" rel="noreferrer">admin.raftaarride@gmail.com</a></p>
          </div>
        </div>
      </div>

      <footer className="pp-footer">
        <div>© 2025 RaftaarRide. All rights reserved.</div>
        <div style={{ marginTop: 10 }}>
          <a href="/terms">Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
        </div>
      </footer>
    </div>
  );
}
