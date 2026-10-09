import React, { useState, useEffect } from 'react';
import { KeyRound, ShieldCheck, Eye, Copy, Check, AlertTriangle, Loader2, Lock } from 'lucide-react';
import { fetchSystemKeys, changeSystemKeys } from '../lib/firebase';
import { subscribeToSystemKeys } from '../lib/supabase';

export interface KeysAdminManagerProps {
  isDayMode: boolean;
  onClose?: () => void;
}

export const KeysAdminManager: React.FC<KeysAdminManagerProps> = ({ isDayMode }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [masterKey, setMasterKey] = useState("");
  const [editorPin, setEditorPin] = useState("");
  const [showMaster, setShowMaster] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  
  const [inputMaster, setInputMaster] = useState("");
  const [inputEditor, setInputEditor] = useState("");
  const [showInputMaster, setShowInputMaster] = useState(false);
  const [showInputEditor, setShowInputEditor] = useState(false);
  
  const [copiedMaster, setCopiedMaster] = useState(false);
  const [copiedEditor, setCopiedEditor] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadKeys = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchSystemKeys();
      if (data) {
        setMasterKey(data.masterKey || "");
        setEditorPin(data.editorPin || "");
        setInputMaster(data.masterKey || "");
        setInputEditor(data.editorPin || "");
      } else {
        setError("No se pudieron cargar las claves o no tienes permisos de Dueño.");
      }
    } catch (err: any) {
      setError(err?.message || "Error al conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();

    // Actualización en tiempo real vía Supabase Realtime si un administrador cambia claves
    const unsub = subscribeToSystemKeys((keys) => {
      if (keys.masterKey) {
        setMasterKey(keys.masterKey);
        setInputMaster(keys.masterKey);
      }
      if (keys.editorPin) {
        setEditorPin(keys.editorPin);
        setInputEditor(keys.editorPin);
      }
    });

    return () => {
      unsub();
    };
  }, []);

  const handleCopy = (text: string, isMaster: boolean) => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      if (isMaster) {
        setCopiedMaster(true);
        setTimeout(() => setCopiedMaster(false), 2000);
      } else {
        setCopiedEditor(true);
        setTimeout(() => setCopiedEditor(false), 2000);
      }
    } catch (_) {}
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMaster = inputMaster.trim();
    const cleanEditor = inputEditor.trim();

    if (!cleanMaster) {
      setError("La Clave Maestra no puede estar vacía.");
      return;
    }
    if (!cleanEditor) {
      setError("El PIN de Editor no puede estar vacío.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await changeSystemKeys(cleanMaster, cleanEditor);
      if (res.success && res.masterKey && res.editorPin) {
        setMasterKey(res.masterKey);
        setEditorPin(res.editorPin);
        setInputMaster(res.masterKey);
        setInputEditor(res.editorPin);
        setSuccess("Claves actualizadas correctamente en la memoria del servidor y en keys-config.json");
        setTimeout(() => setSuccess(""), 4500);
      } else {
        setError(res.error || "No se pudieron actualizar las claves.");
      }
    } catch (err: any) {
      setError(err?.message || "Error al guardar claves en el servidor.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="animate-spin text-red-600" size={22} />
        <span className={`text-xs ${isDayMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
          Consultando estado de claves...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 w-full font-sans">
      {/* Alertas */}
      {error && (
        <div className="p-3 bg-red-950/30 border border-red-500/25 rounded-xl text-xs text-red-300 flex items-center gap-2.5 animate-in fade-in">
          <AlertTriangle size={15} className="shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-950/30 border border-emerald-500/25 rounded-xl text-xs text-emerald-300 flex items-center gap-2.5 animate-in fade-in">
          <Check size={15} className="shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Tarjetas de Claves Actuales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Clave de Administrador */}
        <div className={`p-4 rounded-xl border flex flex-col gap-2.5 transition-all ${
          isDayMode 
            ? 'bg-zinc-50 border-zinc-200' 
            : 'bg-[#121215] border-white/[0.08]'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              isDayMode ? 'text-zinc-800' : 'text-zinc-200'
            }`}>
              <ShieldCheck size={14} className="text-red-500 shrink-0" /> Clave de Administrador
            </span>
            <span className="text-[10px] text-zinc-400 font-medium">
              Administrador
            </span>
          </div>

          <div className={`flex items-center justify-between p-2.5 rounded-lg border ${
            isDayMode 
              ? 'bg-white border-zinc-200 text-zinc-900' 
              : 'bg-black/50 border-white/[0.06] text-zinc-100'
          }`}>
            <span className="font-mono text-xs font-semibold tracking-wider select-all truncate mr-2">
              {showMaster ? masterKey : '••••••••••••'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowMaster(!showMaster)}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  isDayMode 
                    ? 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100' 
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
                title={showMaster ? "Ocultar" : "Mostrar"}
              >
                <Eye size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleCopy(masterKey, true)}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  isDayMode 
                    ? 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100' 
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
                title="Copiar Clave"
              >
                {copiedMaster ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <span className="text-[10px] text-zinc-500 leading-snug">
            Acceso completo para crear, modificar, dar de baja obras y actualizar las claves de la Mediateca.
          </span>
        </div>

        {/* Clave de Editor */}
        <div className={`p-4 rounded-xl border flex flex-col gap-2.5 transition-all ${
          isDayMode 
            ? 'bg-zinc-50 border-zinc-200' 
            : 'bg-[#121215] border-white/[0.08]'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 m-0 p-0 pr-0 -mr-[37px] ${
              isDayMode ? 'text-zinc-800' : 'text-zinc-200'
            }`}>
              <KeyRound size={14} className="text-zinc-400 shrink-0" /> Clave de Editor
            </span>
            <span className="text-[10px] text-zinc-400 font-medium ml-[102px] mr-0 mb-0 p-0">
              Equipo de Catalogación
            </span>
          </div>

          <div className={`flex items-center justify-between p-2.5 rounded-lg border ${
            isDayMode 
              ? 'bg-white border-zinc-200 text-zinc-900' 
              : 'bg-black/50 border-white/[0.06] text-zinc-100'
          }`}>
            <span className="font-mono text-xs font-semibold tracking-wider select-all truncate mr-2">
              {showEditor ? editorPin : '••••••••'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowEditor(!showEditor)}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  isDayMode 
                    ? 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100' 
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
                title={showEditor ? "Ocultar" : "Mostrar"}
              >
                <Eye size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleCopy(editorPin, false)}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  isDayMode 
                    ? 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100' 
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
                title="Copiar Clave"
              >
                {copiedEditor ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <span className="text-[10px] text-zinc-500 leading-snug">
            Permite al equipo registrar nuevas obras y editar fichas técnicas del catálogo.
          </span>
        </div>
      </div>

      {/* Formulario de Modificación de Claves */}
      <form onSubmit={handleSave} className={`p-4 sm:p-5 rounded-xl border flex flex-col gap-4 ${
        isDayMode ? 'bg-zinc-50 border-zinc-200' : 'bg-[#121215] border-white/[0.08]'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
            isDayMode ? 'text-zinc-900' : 'text-zinc-200'
          }`}>
            <Lock size={14} className="text-red-500" /> Modificar Claves de Acceso
          </span>
          <span className="text-[10px] text-zinc-500">
            Sincronización directa
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Nueva Clave de Administrador */}
          <div className="flex flex-col gap-1.5">
            <label className={`text-[11px] font-medium ${isDayMode ? 'text-zinc-700' : 'text-zinc-300'}`}>
              Nueva Clave de Administrador
            </label>
            <div className="relative">
              <input
                type={showInputMaster ? "text" : "password"}
                value={inputMaster}
                onChange={(e) => setInputMaster(e.target.value)}
                placeholder="Ingresar nueva clave"
                required
                className={`w-full rounded-lg px-3 py-2.5 pr-9 text-xs font-mono outline-none transition-colors ${
                  isDayMode
                    ? 'bg-white border border-zinc-300 text-zinc-900 focus:border-red-600 focus:ring-1 focus:ring-red-600/20'
                    : 'bg-black/50 border border-white/[0.08] hover:border-white/15 text-zinc-100 placeholder:text-zinc-600 focus:border-red-600 focus:ring-1 focus:ring-red-600/20'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowInputMaster(!showInputMaster)}
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded transition-colors cursor-pointer ${
                  isDayMode ? 'text-zinc-400 hover:text-zinc-700' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title={showInputMaster ? "Ocultar" : "Mostrar"}
              >
                <Eye size={14} />
              </button>
            </div>
          </div>

          {/* Nueva Clave de Editor */}
          <div className="flex flex-col gap-1.5">
            <label className={`text-[11px] font-medium ${isDayMode ? 'text-zinc-700' : 'text-zinc-300'}`}>
              Nueva Clave de Editor
            </label>
            <div className="relative">
              <input
                type={showInputEditor ? "text" : "password"}
                value={inputEditor}
                onChange={(e) => setInputEditor(e.target.value)}
                placeholder="Ingresar nueva clave"
                required
                className={`w-full rounded-lg px-3 py-2.5 pr-9 text-xs font-mono outline-none transition-colors ${
                  isDayMode
                    ? 'bg-white border border-zinc-300 text-zinc-900 focus:border-red-600 focus:ring-1 focus:ring-red-600/20'
                    : 'bg-black/50 border border-white/[0.08] hover:border-white/15 text-zinc-100 placeholder:text-zinc-600 focus:border-red-600 focus:ring-1 focus:ring-red-600/20'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowInputEditor(!showInputEditor)}
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded transition-colors cursor-pointer ${
                  isDayMode ? 'text-zinc-400 hover:text-zinc-700' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title={showInputEditor ? "Ocultar" : "Mostrar"}
              >
                <Eye size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving || !inputMaster.trim() || !inputEditor.trim()}
            className="px-5 py-2.5 rounded-lg bg-red-700 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 border border-red-500/30 active:scale-[0.98]"
          >
            {saving ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>Guardar Cambios</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
