import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function AuthCallback() {
  const { refresh } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errParam = params.get("error");
    if (errParam) {
      setError(
        errParam === "user_init_failed"
          ? "We couldn't finish setting up your account. Please try signing in again in a moment."
          : "Something went wrong signing you in. Please try again."
      );
      return;
    }
    refresh().then(() => {
      window.location.replace("/");
    });
  }, []);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#f8fafc", color: "#111", fontSize: 16, gap: 16,
    }}>
      {error ? (
        <>
          <div style={{ color: "#dc2626", maxWidth: 420, textAlign: "center" }}>{error}</div>
          <a href="/" style={{ color: "#3b82f6" }}>Back to sign in</a>
        </>
      ) : (
        "Signing you in..."
      )}
    </div>
  );
}
