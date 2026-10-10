import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  apiRequest,
  setCsrfToken,
  setUnauthorizedListener,
} from '../../api/client.ts';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

interface SessionResponse {
  user: SessionUser;
  permissions: string[];
  csrfToken: string;
  expiresAt: string;
}

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous'; expired: boolean }
  | { status: 'authenticated'; user: SessionUser; permissions: string[] };

interface AuthContextValue {
  state: AuthState;
  /** Lanza ApiError si las credenciales son inválidas o hay demasiados intentos. */
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function applySession(session: SessionResponse): AuthState {
  setCsrfToken(session.csrfToken);
  return {
    status: 'authenticated',
    user: session.user,
    permissions: session.permissions,
  };
}

/**
 * El estado de sesión se obtiene siempre del servidor (GET /auth/session). No se
 * guarda nada sensible en localStorage: la sesión vive en una cookie HttpOnly.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<SessionResponse>('/auth/session', {
      signal: controller.signal,
      skipUnauthorizedHandler: true,
    })
      .then((session) => setState(applySession(session)))
      .catch(() => {
        if (controller.signal.aborted) return;
        // 401 es lo normal sin sesión; ante cualquier otro error también se muestra el acceso.
        setCsrfToken(null);
        setState({ status: 'anonymous', expired: false });
      });
    return () => controller.abort();
  }, []);

  // Una respuesta 401 en una petición autenticada significa sesión expirada o revocada.
  useEffect(() => {
    setUnauthorizedListener(() => {
      setCsrfToken(null);
      setState({ status: 'anonymous', expired: true });
    });
    return () => setUnauthorizedListener(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await apiRequest<SessionResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipUnauthorizedHandler: true,
    });
    setState(applySession(session));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest<void>('/auth/logout', { method: 'POST' });
    } catch {
      // Sesión ya caducada o servidor inaccesible: igualmente se cierra la sesión local.
      // Si la red falló, la sesión del servidor expirará por inactividad.
    }
    setCsrfToken(null);
    setState({ status: 'anonymous', expired: false });
  }, []);

  const value = useMemo(
    () => ({ state, login, logout }),
    [state, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}

export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
