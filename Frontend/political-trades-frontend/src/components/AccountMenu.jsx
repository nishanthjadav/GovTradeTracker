import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

function initials(name) {
  if (!name) return "??";
  const parts = name.trim().split(" ");
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}

export default function AccountMenu({ onOpenAccount }) {
  const { user, isGuest, signIn, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user && !isGuest) return null;

  if (isGuest) {
    return (
      <div ref={ref} style={{ position: "relative" }}>
        <button
          onClick={() => setOpen(!open)}
          title="Guest"
          style={{
            width: 36, height: 36, borderRadius: "50%", border: "1px solid #cbd5e1",
            background: "#f1f5f9", color: "#64748b", fontWeight: 600, fontSize: 13,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ?
        </button>
        {open && (
          <div style={{
            position: "absolute", top: 44, right: 0, minWidth: 240,
            background: "var(--color-surface, #fff)", border: "1px solid var(--color-border, #e2e8f0)",
            borderRadius: 8, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", zIndex: 100, padding: 16,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>You're browsing as a guest</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
              Sign in to copy politician trades and link your Alpaca paper-trading account.
            </div>
            <button onClick={() => { setOpen(false); signIn(); }} style={signInBtnStyle}>
              Sign in with Google
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        title={user.name}
        style={{
          width: 36, height: 36, borderRadius: "50%", border: "none", padding: 0,
          background: user.avatarUrl ? `url(${user.avatarUrl}) center/cover` : "#3b82f6",
          color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
        }}
      >
        {!user.avatarUrl && initials(user.name || user.email)}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 44, right: 0, minWidth: 220,
          background: "var(--color-surface, #fff)", border: "1px solid var(--color-border, #e2e8f0)",
          borderRadius: 8, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", zIndex: 100, overflow: "hidden",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--color-border-subtle, #f1f5f9)" }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary, #0f172a)" }}>
              {user.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted, #64748b)" }}>
              {user.email}
            </div>
          </div>
          <button onClick={() => { setOpen(false); onOpenAccount?.(); }} style={menuItemStyle}>
            Account
          </button>
          <button
            onClick={() => { setOpen(false); signOut(); }}
            style={{ ...menuItemStyle, borderTop: "1px solid var(--color-border-subtle, #f1f5f9)" }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const menuItemStyle = {
  display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
  background: "transparent", border: "none", cursor: "pointer", fontSize: 14,
  color: "var(--color-text-primary, #0f172a)",
};

const signInBtnStyle = {
  width: "100%", padding: "9px 14px", background: "#3b82f6", color: "#fff",
  border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
