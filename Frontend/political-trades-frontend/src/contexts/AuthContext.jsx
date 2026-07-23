import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch, API_BASE } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  // true when the backend is unreachable (network error / connection refused)
  // or returning a server error (5xx) — e.g. our Neon DB has hit its monthly
  // compute limit. A 401/403 is NOT "down" — it just means "not signed in".
  const [backendDown, setBackendDown] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/auth/me");
      if (res.ok) {
        setUser(await res.json());
        setIsGuest(false);
        setBackendDown(false);
      } else if (res.status >= 500) {
        // server up enough to respond, but erroring (DB down / compute limit)
        setUser(null);
        setBackendDown(true);
      } else {
        setUser(null);
      }
    } catch {
      // fetch threw — backend is unreachable entirely
      setUser(null);
      setBackendDown(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = () => {
    window.location.href = `${API_BASE}/oauth2/authorization/google`;
  };

  const continueAsGuest = () => {
    setIsGuest(true);
  };

  const signOut = async () => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setIsGuest(false);
    await refresh();
  };

  return (
    <AuthContext.Provider value={{ user, loading, isGuest, backendDown, signIn, continueAsGuest, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
