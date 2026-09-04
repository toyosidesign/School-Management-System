import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../lib/api';

type AuthValue = {
  user: any;
  loading: boolean;
  login: (email: string, password: string) => Promise<any>;
  loginWithCode: (code: string) => Promise<any>;
  devLoginPupil: (studentCode: string) => Promise<any>;
  /** Signs in the account an invitation just created or unlocked. */
  adopt: (token: string, profile: any) => void;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Parent portal: which child's records are currently in view. */
  activeChildId: number | null;
  setActiveChildId: (id: number) => void;
  activeChild: any;
};

const AuthContext = createContext<AuthValue>(null!);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeChildId, setActiveChildIdState] = useState<number | null>(
    Number(localStorage.getItem('sms.child')) || null
  );

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try {
      setUser(await api.get('/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Default the parent portal to their first child.
  useEffect(() => {
    if (user?.role === 'parent' && user.children?.length) {
      const stillValid = user.children.some((c: any) => c.id === activeChildId);
      if (!stillValid) setActiveChildIdState(user.children[0].id);
    }
  }, [user, activeChildId]);

  const setActiveChildId = (id: number) => {
    setActiveChildIdState(id);
    localStorage.setItem('sms.child', String(id));
  };

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  /** Pupils sign in with a code issued by the school, never a password. */
  const loginWithCode = async (code: string) => {
    const res = await api.post('/auth/login-code', { code });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  /** Development only: signs in as a pupil without needing their code. */
  const devLoginPupil = async (studentCode: string) => {
    const res = await api.post('/auth/dev-login', { student: studentCode });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  /** An accepted invitation returns a token and profile, so skip the sign-in. */
  const adopt = (jwt: string, profile: any) => {
    setToken(jwt);
    setUser(profile);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('sms.child');
    setUser(null);
    location.href = '/login';
  };

  const activeChild = useMemo(
    () => user?.children?.find((c: any) => c.id === activeChildId) ?? user?.children?.[0] ?? null,
    [user, activeChildId]
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithCode, devLoginPupil, adopt, logout, refresh, activeChildId, setActiveChildId, activeChild }}>
      {children}
    </AuthContext.Provider>
  );
}
