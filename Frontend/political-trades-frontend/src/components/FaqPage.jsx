const FAQS = [
  {
    q: "Is this legal?",
    a: "Yes. The STOCK Act of 2012 requires members of Congress to publicly disclose their stock trades. GovTrade Tracker just surfaces that already-public data in a friendlier format than the original PDFs.",
  },
  {
    q: "How current is the data?",
    a: "Disclosures can lag the actual trade by up to 45 days under current law, so by the time you see a trade here, the market has likely already moved. Every trade row shows a 'filed X d after' tag so you can see how stale that particular disclosure is.",
  },
  {
    q: "What does 'copy trading' mean here?",
    a: "When you check a politician in the feed, they're added to your copy list. Once you link an Alpaca paper-trading account, future trades disclosed by those politicians will be mirrored into your paper account, sized according to the portfolio allocation you set.",
  },
  {
    q: "Why are some trade sizes shown as ranges like $50K – $100K?",
    a: "Congress members aren't required to disclose exact dollar amounts, only size brackets. The ranges you see come directly from the filings themselves.",
  },
  {
    q: "Can I trade with real money?",
    a: "Not yet. The site currently supports paper trading through Alpaca only. Live brokerage integration is on the roadmap but not enabled.",
  },
  {
    q: "Why don't I see a politician I expected?",
    a: "Only politicians who have filed at least one trade disclosure show up. Members who don't trade individual stocks won't appear, and recently-elected members may not yet have filings.",
  },
];

export default function FaqPage({ onBack }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 8px" }}>
      <div className="content-header">
        <div>
          <div className="content-title">Frequently Asked Questions</div>
          <div className="content-sub">Answers to common questions about the data and how copy-trading works</div>
        </div>
      </div>
            <div style={{ height: 16 }} />


      {FAQS.map((item, i) => (
        <section key={i} style={cardStyle}>
          <div style={questionStyle}>{item.q}</div>
          <p style={answerStyle}>{item.a}</p>
        </section>
      ))}
    </div>
  );
}

const cardStyle = {
  background: "var(--color-surface, #fff)",
  border: "1px solid var(--color-border, #e2e8f0)",
  borderRadius: 12,
  padding: 20,
  marginBottom: 12,
};

const questionStyle = {
  fontSize: 15,
  fontWeight: 600,
  marginBottom: 8,
  color: "var(--color-text-primary, #0f172a)",
};

const answerStyle = {
  fontSize: 14,
  lineHeight: 1.6,
  color: "var(--color-text-secondary, #475569)",
};
