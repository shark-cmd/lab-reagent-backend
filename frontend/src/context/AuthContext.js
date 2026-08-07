import { createContext, useContext, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("ls_user")) || null;
    } catch {
      return null;
    }
  });

  const login = useCallback(async (username, password, pin) => {
    const { data } = await api.post("/auth/login", { username, password, pin });
    localStorage.setItem("ls_token", data.token);
    localStorage.setItem("ls_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ls_token");
    localStorage.removeItem("ls_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthed: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
