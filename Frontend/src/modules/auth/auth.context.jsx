import { createContext, useCallback, useEffect, useState } from "react";
import {
  api,
  setAccessToken,
  setAuthChangeHandler,
  refreshSession,
} from "../../shared/api/client";

export const AuthContext = createContext(null);

export const AuthProvider = (props) => {
  const [User, setUser] = useState(null);
  const [token, setTokenState] = useState(null);

  const [bootstrapped, setBootstrapped] = useState(false);

  const setToken = useCallback((next) => {
    setAccessToken(next || null);
    setTokenState(next || null);
  }, []);

  useEffect(() => {
    setAuthChangeHandler(({ token: nextToken, user }) => {
      setTokenState(nextToken || null);
      if (user) setUser(user);
      if (!nextToken) setUser(null);
    });

    refreshSession()
      .catch(() => {})
      .finally(() => setBootstrapped(true));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
    }
    setToken(null);
    setUser(null);
  }, [setToken]);

  return (
    <AuthContext.Provider
      value={{ User, token, setUser, setToken, logout, bootstrapped }}
    >
      {props.children}
    </AuthContext.Provider>
  );
};
