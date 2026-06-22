import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function AuthCallback() {
  const { refresh } = useAuth();

  useEffect(() => {
    refresh().then(() => {
      window.location.replace("/");
    });
  }, []);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#f8fafc", color: "#111", fontSize: 16,
    }}>
      Signing you in...
    </div>
  );
}
