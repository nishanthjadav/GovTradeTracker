export default function NotFound() {
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
    }}>
      {/* Animated stock chart */}
      <svg width="220" height="100" viewBox="0 0 220 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Grid lines */}
        {[20, 40, 60, 80].map(y => (
          <line key={y} x1="10" y1={y} x2="210" y2={y} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        {/* Animated chart line */}
        <polyline
          points="10,20 35,40 60,28 85,55 110,42 135,65 160,50 185,75 210,88"
          fill="none"
          stroke="#ef4444"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="400"
          strokeDashoffset="400"
          style={{ animation: "drawLine 1.8s ease forwards" }}
        />
        {/* Animated fill */}
        <polygon
          points="10,20 35,40 60,28 85,55 110,42 135,65 160,50 185,75 210,88 210,95 10,95"
          fill="url(#grad)"
          opacity="0"
          style={{ animation: "fadeIn 0.6s ease 1.6s forwards" }}
        />
        {/* Animated dot at end */}
        <circle
          cx="210" cy="88" r="4"
          fill="#ef4444"
          opacity="0"
          style={{ animation: "fadeIn 0.3s ease 1.7s forwards" }}
        />
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* Ticker falling animation */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        color: "#ef4444",
        fontWeight: 600,
        animation: "fadeIn 0.4s ease 1.8s both",
      }}>
        <span style={{ animation: "bounce 1s ease 2s infinite" }}>▼</span>
        <span>PAGE</span>
        <span style={{
          background: "#fee2e2",
          color: "#ef4444",
          padding: "2px 8px",
          borderRadius: 4,
          fontFamily: "monospace",
        }}>-100.00%</span>
      </div>

      <div style={{
        fontSize: 72,
        fontWeight: 800,
        color: "#0f172a",
        letterSpacing: "-4px",
        lineHeight: 1,
        animation: "fadeUp 0.5s ease 0.2s both",
      }}>
        404
      </div>

      <div style={{
        fontSize: 18,
        fontWeight: 600,
        color: "#334155",
        animation: "fadeUp 0.5s ease 0.4s both",
      }}>
        This page has been delisted
      </div>

      <div style={{
        fontSize: 14,
        color: "#64748b",
        animation: "fadeUp 0.5s ease 0.5s both",
      }}>
        The page you're looking for doesn't exist or has moved.
      </div>

      <a
        href="/"
        style={{
          marginTop: 8,
          padding: "10px 24px",
          background: "#3b82f6",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontSize: 14,
          fontWeight: 600,
          animation: "fadeUp 0.5s ease 0.6s both",
        }}
      >
        Back to Feed
      </a>

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
