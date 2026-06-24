import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../contexts/AuthContext";

export default function AccountPage({ onBack }) {
  const { user, isGuest, signIn, refresh } = useAuth();
  const [status, setStatus] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const loadStatus = () => {
    apiFetch("/me/alpaca/status")
      .then(r => r.ok ? r.json() : null)
      .then(setStatus)
      .catch(() => {});
  };

  useEffect(() => { if (!isGuest) loadStatus(); }, [isGuest]);

  const handleLink = async (e) => {
    e.preventDefault();
    setError(null);
    if (!apiKey.trim() || !apiSecret.trim()) {
      setError("Enter both your API key and secret.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/me/alpaca", {
        method: "PUT",
        body: JSON.stringify({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to link Alpaca account");
      }
      setApiKey("");
      setApiSecret("");
      loadStatus();
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    setSaving(true);
    try {
      await apiFetch("/me/alpaca", { method: "DELETE" });
      loadStatus();
      refresh();
    } finally {
      setSaving(false);
    }
  };

  if (isGuest) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 8px" }}>
        <div className="content-header">
          <div>
            <div className="content-title">Account</div>
            <div className="content-sub">Profile and linked trading accounts</div>
          </div>
        </div>
        <div className="tab-row">
          <div className="tab" onClick={onBack}>← Back to Feed</div>
        </div>
        <section style={cardStyle}>
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Sign in to access your account</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
              You need to be signed in to link your Alpaca account and manage your portfolio.
            </div>
            <button onClick={signIn} style={signInBtnStyle}>
              Sign in with Google
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 8px" }}>
      <div className="content-header">
        <div>
          <div className="content-title">Account</div>
          <div className="content-sub">Profile and linked trading accounts</div>
        </div>
      </div>
      <div style={{ height: 16 }} />


      {/* Profile */}
      <section style={cardStyle}>
        <div style={sectionTitleStyle}>Profile</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" style={{ width: 56, height: 56, borderRadius: "50%" }} />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: "50%", background: "#3b82f6",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 600, fontSize: 18,
            }}>
              {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{user?.name}</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted, #64748b)" }}>{user?.email}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted, #94a3b8)", marginTop: 4 }}>
              Signed in with Google
            </div>
          </div>
        </div>
      </section>

      {/* Alpaca paper */}
      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={sectionTitleStyle}>Alpaca Paper Trading</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted, #64748b)" }}>
              Link your Alpaca paper-trading account to fake-execute copied trades.
            </div>
          </div>
          {status?.linked && (
            <span style={{
              background: "#dcfce7", color: "#166534", fontSize: 12, fontWeight: 600,
              padding: "4px 10px", borderRadius: 999,
            }}>
              Linked
            </span>
          )}
        </div>

        {status?.linked ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: "monospace", fontSize: 14 }}>{status.maskedKey}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted, #64748b)", marginTop: 4 }}>
              Linked {status.linkedAt ? new Date(status.linkedAt).toLocaleString() : ""}
            </div>
            <button
              onClick={handleUnlink}
              disabled={saving}
              style={{ ...btnStyle, marginTop: 14, background: "#fee2e2", color: "#b91c1c" }}
            >
              {saving ? "Unlinking..." : "Unlink"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleLink} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="text"
              placeholder="API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={inputStyle}
              autoComplete="off"
            />
            <input
              type="password"
              placeholder="API Secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              style={inputStyle}
              autoComplete="off"
            />
            {error && <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={saving} style={{ ...btnStyle, background: "#3b82f6", color: "#fff" }}>
                {saving ? "Linking..." : "Link Account"}
              </button>
              <a
                href="https://app.alpaca.markets/paper/dashboard/overview"
                target="_blank"
                rel="noreferrer"
                style={{ ...btnStyle, background: "transparent", color: "#3b82f6", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
              >
                Get keys →
              </a>
            </div>
          </form>
        )}
      </section>

      {/* Real trading — coming soon */}
      <section style={{ ...cardStyle, opacity: 0.7 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={sectionTitleStyle}>Real Trading Account</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted, #64748b)" }}>
              Connect a live brokerage to execute real trades from copied disclosures.
            </div>
          </div>
          <span style={{
            background: "#fef3c7", color: "#92400e", fontSize: 12, fontWeight: 600,
            padding: "4px 10px", borderRadius: 999,
          }}>
            Coming soon
          </span>
        </div>
        <button disabled style={{ ...btnStyle, marginTop: 14, cursor: "not-allowed", background: "#e2e8f0", color: "#64748b" }}>
          Link Real Account
        </button>
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
  fontSize: 16, fontWeight: 600, marginBottom: 4,
  color: "var(--color-text-primary, #0f172a)",
};

const inputStyle = {
  border: "1px solid var(--color-border, #cbd5e1)",
  borderRadius: 8, padding: "10px 12px", fontSize: 14,
  width: "100%", fontFamily: "monospace",
};

const btnStyle = {
  border: "none", borderRadius: 8, padding: "10px 16px",
  fontSize: 14, fontWeight: 600, cursor: "pointer",
};

const signInBtnStyle = {
  padding: "10px 24px", background: "#3b82f6", color: "#fff",
  border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
};
