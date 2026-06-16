import { useAuth } from "../contexts/AuthContext";

export default function SignInGate({ children }) {
  const { user, loading, signIn } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--color-bg, #fafafa)", color: "var(--color-text-primary, #111)"
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f8fafc 0%, #e0e7ef 100%)",
        padding: 24,
      }}>
        <div style={{
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          padding: "40px 36px",
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            Gov<span style={{ color: "#3b82f6" }}>Trade</span> Tracker
          </div>
          <div style={{ color: "#475569", fontSize: 14, marginBottom: 28 }}>
            Track and copy political stock trades.
            Sign in to manage your portfolio and link a paper-trading account.
          </div>
          <button
            onClick={signIn}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              background: "#fff",
              color: "#3c4043",
              border: "1px solid #dadce0",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(60,64,67,0.08)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return children;
}
