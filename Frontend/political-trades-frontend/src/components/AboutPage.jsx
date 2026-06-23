export default function AboutPage({ onBack }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 8px" }}>
      <div className="content-header">
        <div>
          <div className="content-title">About GovTrade Tracker</div>
          <div className="content-sub">What this is, where the data comes from, and the fine print</div>
        </div>
      </div>

      <div style={{ height: 16 }} />

      <section style={cardStyle}>
        <div style={sectionTitleStyle}>What this is</div>
        <p style={paragraphStyle}>
          GovTrade Tracker surfaces stock trades disclosed by US Congress members under the STOCK
          Act of 2012. You can browse who's trading what, look into individual politicians'
          activity, and  mirror their disclosed trades into a fake portfolio to see how a copy-trading strategy 
          might have performed (once you link an Alpaca paper-trading account).
        </p>
        <p style={paragraphStyle}>
          The goal is to make money off of politicians who insider trade.
        </p>
      </section>

      <section style={cardStyle}>
        <div style={sectionTitleStyle}>Where the data comes from</div>
        <p style={paragraphStyle}>
          All trade records originate from periodic transaction reports (PTRs) that members of
          Congress are legally required to file with the House Clerk and Senate Office of Public
          Records. These filings are public.
        </p>
        <p style={paragraphStyle}>
          Disclosures can lag the actual trade by up to 45 days under current law. The
          <span style={{ fontFamily: "monospace" }}> filed X d after </span>
          tag shown on each trade row tells you how stale a specific disclosure is. This is useful
          context when thinking about whether the information is still actionable.
        </p>
      </section>

      <section style={cardStyle}>
        <div style={sectionTitleStyle}>Disclaimer</div>
        <p style={paragraphStyle}>
          Nothing on this site is financial advice. Disclosures are reported in size brackets
          (e.g. $50K–$100K) rather than exact dollar amounts, so any displayed totals are
          approximations.
        </p>
        <p style={paragraphStyle}>
          Copy-trading is currently limited to Alpaca paper accounts. No real-money execution is
          supported yet.
        </p>
      </section>
    </div>
  );
}

const cardStyle = {
  background: "var(--color-surface, #fff)",
  border: "1px solid var(--color-border, #e2e8f0)",
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
};

const sectionTitleStyle = {
  fontSize: 16,
  fontWeight: 600,
  marginBottom: 10,
  color: "var(--color-text-primary, #0f172a)",
};

const paragraphStyle = {
  fontSize: 14,
  lineHeight: 1.6,
  color: "var(--color-text-secondary, #475569)",
  marginBottom: 10,
};
