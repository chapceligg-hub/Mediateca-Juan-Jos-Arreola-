// ==========================================
// SISTEMA DE AUTENTICACIÓN Y DOS LLAVES
// (Clave Maestra & PIN de Editor)
// 100% libre de Firebase - Integrado con Supabase y Backend Express
// ==========================================

export type UserRole = 'owner' | 'editor' | 'viewer';

export const getStoredAccessKey = (): string => {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem('app_key') || '').trim();
};

export const setStoredAccessKey = (key: string): void => {
  if (typeof window === 'undefined') return;
  const clean = (key || '').trim();
  if (clean) {
    localStorage.setItem('app_key', clean);
  } else {
    localStorage.removeItem('app_key');
  }
};

export const clearStoredAccessKey = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('app_key');
};

export const getAuthHeaders = (): Record<string, string> => {
  const key = getStoredAccessKey();
  if (!key) return {};
  return { 'x-access-key': key };
};

// Event listener global para capturar respuestas 401/403 en peticiones
type AuthExpiredListener = () => void;
const authExpiredListeners = new Set<AuthExpiredListener>();

export const onAuthExpiredOrDenied = (listener: AuthExpiredListener) => {
  authExpiredListeners.add(listener);
  return () => {
    authExpiredListeners.delete(listener);
  };
};

export const notifyAuthExpiredOrDenied = () => {
  for (const listener of authExpiredListeners) {
    try {
      listener();
    } catch (_) {}
  }
};

// Validar clave directamente con el servidor
export const loginWithAccessKey = async (key: string): Promise<{ valid: boolean; role?: 'owner' | 'editor'; message?: string }> => {
  const clean = (key || '').trim();
  if (!clean) {
    return { valid: false, message: 'CLAVE_VACIA' };
  }

  try {
    const res = await fetch('/api/auth/login-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: clean })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.valid && (data.role === 'owner' || data.role === 'editor')) {
        setStoredAccessKey(clean);
        return { valid: true, role: data.role };
      }
    }

    return { valid: false, message: 'CLAVE_INVALIDA' };
  } catch (err) {
    console.error('Error al verificar clave de acceso:', err);
    return { valid: false, message: 'ERROR_CONEXION' };
  }
};

// Verificar estado de la clave almacenada en localStorage
export const verifyStoredKey = async (): Promise<{ valid: boolean; role: UserRole }> => {
  const savedKey = getStoredAccessKey();
  if (!savedKey) {
    return { valid: false, role: 'viewer' };
  }

  const result = await loginWithAccessKey(savedKey);
  if (result.valid && result.role) {
    return { valid: true, role: result.role };
  }

  // Si la clave ya no es válida (ej. fue cambiada en el servidor), limpiarla
  clearStoredAccessKey();
  return { valid: false, role: 'viewer' };
};

// Obtener claves del sistema (Solo Dueño / 'owner')
export const fetchSystemKeys = async (): Promise<{ masterKey: string; editorPin: string } | null> => {
  try {
    const res = await fetch('/api/auth/keys', {
      headers: {
        ...getAuthHeaders()
      }
    });

    if (res.status === 401 || res.status === 403) {
      notifyAuthExpiredOrDenied();
      return null;
    }

    if (!res.ok) return null;
    const data = await res.json();
    return {
      masterKey: data.masterKey || '',
      editorPin: data.editorPin || ''
    };
  } catch (err) {
    console.error('Error al obtener claves del sistema:', err);
    return null;
  }
};

// Modificar claves del sistema (Solo Dueño / 'owner')
export const changeSystemKeys = async (
  newMasterKey: string,
  newEditorPin: string
): Promise<{ success: boolean; masterKey?: string; editorPin?: string; error?: string }> => {
  try {
    const res = await fetch('/api/auth/change-keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        newMasterKey: newMasterKey.trim(),
        newEditorPin: newEditorPin.trim()
      })
    });

    if (res.status === 401 || res.status === 403) {
      notifyAuthExpiredOrDenied();
      return { success: false, error: 'NO_ACCESS' };
    }

    const data = await res.json();
    if (res.ok && data.success) {
      // Actualizar la clave local con la nueva clave maestra
      setStoredAccessKey(newMasterKey.trim());
      return {
        success: true,
        masterKey: data.masterKey,
        editorPin: data.editorPin
      };
    }

    return { success: false, error: data.error || 'Error al cambiar las claves' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error de conexión con el servidor' };
  }
};
