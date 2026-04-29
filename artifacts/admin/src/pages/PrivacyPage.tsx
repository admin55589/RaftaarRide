export function PrivacyPage() {
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
        .pp-num{min-width:36px;width:36px;height:36px;background:linear-gradient(135deg,#F5A623,#E09010);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#0A0A0F;flex-shrink:0;margin:0;padding:0}
        .pp-title{font-size:17px;font-weight:700;color:#F5A623;line-height:36px;margin:0;padding:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
        <div className="pp-icon">🔒</div>
        <h1 className="pp-h1">Privacy Policy</h1>
        <div className="pp-meta">Effective Date: <span>20 April 2025</span></div>
        <div className="pp-tabs">
          <button className="pp-tab" onClick={() => window.location.href = "/terms"}>📋 Terms of Service</button>
          <button className="pp-tab active">🔒 Privacy Policy</button>
        </div>
      </div>

      <div className="pp-container">
        {[
          { n: "01", title: "Information We Collect", body: <><p style={{ marginBottom: 10 }}>Your privacy is important to us. This policy explains how we collect, use, and protect your data. We may collect:</p><ul className="pp-list"><li>Name, phone number, email</li><li>Location data (GPS for rides)</li><li>Payment details</li><li>Device information</li></ul></> },
          { n: "02", title: "How We Use Your Data", body: <ul className="pp-list"><li>To provide ride services</li><li>To improve app performance</li><li>For safety and fraud prevention</li><li>Customer support</li></ul> },
          { n: "03", title: "Location Data", body: <><p style={{ marginBottom: 10 }}>We collect real-time location to:</p><ul className="pp-list"><li>Match riders with drivers</li><li>Track rides</li><li>Ensure safety</li></ul></> },
          { n: "04", title: "Sharing of Information", body: <><p style={{ marginBottom: 10 }}>We may share data with:</p><ul className="pp-list"><li>Drivers (for ride completion)</li><li>Payment gateways</li><li>Legal authorities if required</li></ul></> },
          { n: "05", title: "Data Security", body: <p>We use industry-standard security measures to protect your data.</p> },
          { n: "06", title: "Cookies & Tracking", body: <p>We may use cookies and analytics tools to improve user experience.</p> },
          { n: "07", title: "User Rights", body: <><p style={{ marginBottom: 10 }}>You can:</p><ul className="pp-list"><li>Access your data</li><li>Request correction</li><li>Request account deletion</li></ul></> },
          { n: "08", title: "Data Retention", body: <p>We keep your data as long as necessary for service and legal compliance.</p> },
          { n: "09", title: "Children's Privacy", body: <p>Our app is not intended for users under 18 years.</p> },
          { n: "10", title: "Changes to Policy", body: <p>We may update this Privacy Policy periodically. Continued use means acceptance of changes.</p> },
        ].map(({ n, title, body }) => (
          <div key={n} className="pp-card">
            <div className="pp-card-head">
              <div className="pp-num">{n}</div>
              <div className="pp-title">{title}</div>
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
