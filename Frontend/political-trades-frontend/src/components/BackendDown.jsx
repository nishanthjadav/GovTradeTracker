export default function BackendDown() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #f8fafc 0%, #e0e7ef 100%)",
      fontFamily: "sans-serif",
      gap: 16,
      padding: "0 24px",
      textAlign: "center",
    }}>
      <svg width="220" height="100" viewBox="0 0 220 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        {[20, 40, 60, 80].map(y => (
          <line key={y} x1="10" y1={y} x2="210" y2={y} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        <polyline
          points="10,30 35,32 60,28 85,35 110,30 135,55 160,72 185,84 210,90"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="400"
          strokeDashoffset="400"
          style={{ animation: "drawLine 1.8s ease forwards" }}
        />
        <polygon
          points="10,30 35,32 60,28 85,35 110,30 135,55 160,72 185,84 210,90 210,95 10,95"
          fill="url(#gradDown)"
          opacity="0"
          style={{ animation: "fadeIn 0.6s ease 1.6s forwards" }}
        />
        <circle
          cx="210" cy="90" r="4"
          fill="#f59e0b"
          opacity="0"
          style={{ animation: "fadeIn 0.3s ease 1.7s forwards" }}
        />
        <defs>
          <linearGradient id="gradDown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        color: "#f59e0b",
        fontWeight: 600,
        animation: "fadeIn 0.4s ease 1.8s both",
      }}>
        <span style={{ animation: "bounce 1s ease 2s infinite" }}>▼</span>
        <span>MARKET</span>
        <span style={{
          background: "#fef3c7",
          color: "#b45309",
          padding: "2px 8px",
          borderRadius: 4,
          fontFamily: "monospace",
        }}>HALTED</span>
      </div>

      <div style={{
        fontSize: 22,
        fontWeight: 800,
        color: "#0f172a",
        letterSpacing: "-0.5px",
        lineHeight: 1.2,
        maxWidth: 460,
        animation: "fadeUp 0.5s ease 0.4s both",
      }}>
        We've hit our monthly compute limit
      </div>

      <div style={{
        fontSize: 14,
        color: "#64748b",
        lineHeight: 1.6,
        maxWidth: 420,
        animation: "fadeUp 0.5s ease 0.55s both",
      }}>
        Apologies, Gov Trade Tracker runs on a free tier, and we've maxed out
        our database compute for this month. The feed is temporarily offline.
        Please check back next month! (maybe i should use my insane profits from this 
        app to pay for more compute...)
      </div>

      <style>{`
        @keyframes drawLine {
          to { stroke-dashoffset: 0; }
        }
        @keyframes fadeIn {
          to { opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(4px); }
        }
      `}</style>
    </div>
  );
}
