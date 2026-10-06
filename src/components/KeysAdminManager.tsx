import React, { useState, useEffect } from 'react';
import { Crown, Edit2, Eye, Copy, Check, AlertTriangle, Loader2, KeyRound } from 'lucide-react';
import { fetchSystemKeys, changeSystemKeys } from '../lib/firebase';

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
        setSuccess("¡Claves actualizadas correctamente en la memoria RAM y en keys-config.json!");
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
        <Loader2 className="animate-spin text-[#b41d1d]" size={26} />
        <span className={`text-xs font-semibold ${isDayMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
          Cargando configuración de claves desde el servidor...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full font-sans">
      {/* Alertas */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400 flex items-center gap-2.5 animate-in fade-in">
          <AlertTriangle size={16} className="shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-xs text-emerald-400 flex items-center gap-2.5 animate-in fade-in">
          <Check size={16} className="shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Tarjetas de Claves Actuales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Clave Maestra */}
        <div className={`p-4 rounded-2xl border flex flex-col gap-3 transition-all ${
          isDayMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-500/[0.04] border-amber-500/30'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
              <Crown size={15} /> Clave Maestra (Dueño)
            </span>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold border border-amber-500/20">
              Control Total
            </span>
          </div>

          <div className={`flex items-center justify-between p-3 rounded-xl border ${
            isDayMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-black/60 border-white/10 text-white'
          }`}>
            <span className="font-mono text-sm font-bold tracking-wider select-all truncate mr-2">
              {showMaster ? masterKey : '••••••••••••'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowMaster(!showMaster)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isDayMode ? 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title={showMaster ? "Ocultar clave" : "Mostrar clave en texto claro"}
              >
                <Eye size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleCopy(masterKey, true)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isDayMode ? 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title="Copiar Clave Maestra"
              >
                {copiedMaster ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
              </button>
            </div>
          </div>
          <span className="text-[10px] text-zinc-400 leading-tight">
            Otorga permisos de Dueño para Crear, Editar, Eliminar películas y gestionar las claves del sistema.
          </span>
        </div>

        {/* PIN de Editor */}
        <div className={`p-4 rounded-2xl border flex flex-col gap-3 transition-all ${
          isDayMode ? 'bg-sky-500/5 border-sky-500/20' : 'bg-sky-500/[0.04] border-sky-500/30'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
              <Edit2 size={14} /> PIN de Editor (Colaborador)
            </span>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 font-bold border border-sky-500/20">
              Solo Edición
            </span>
          </div>

          <div className={`flex items-center justify-between p-3 rounded-xl border ${
            isDayMode ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-black/60 border-white/10 text-white'
          }`}>
            <span className="font-mono text-sm font-bold tracking-wider select-all truncate mr-2">
              {showEditor ? editorPin : '••••••••'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowEditor(!showEditor)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isDayMode ? 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title={showEditor ? "Ocultar PIN" : "Mostrar PIN en texto claro"}
              >
                <Eye size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleCopy(editorPin, false)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isDayMode ? 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title="Copiar PIN de Editor"
              >
                {copiedEditor ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
              </button>
            </div>
          </div>
          <span className="text-[10px] text-zinc-400 leading-tight">
            Permite a colaboradores Agregar y Modificar películas. No pueden eliminar obras ni ver o cambiar claves.
          </span>
        </div>
      </div>

      {/* Formulario de Modificación de Claves */}
      <form onSubmit={handleSave} className={`p-5 rounded-2xl border flex flex-col gap-4 ${
        isDayMode ? 'bg-zinc-50 border-zinc-200' : 'bg-[#121215] border-white/[0.08]'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 ${isDayMode ? 'text-zinc-900' : 'text-white'}`}>
            <KeyRound size={15} className="text-[#b41d1d]" /> Cambiar Claves del Sistema
          </span>
          <span className="text-[10px] text-zinc-500">
            Persistencia automática en servidor
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Nueva Clave Maestra */}
          <div className="flex flex-col gap-1.5">
            <label className={`text-[11px] font-bold flex items-center justify-between ${isDayMode ? 'text-zinc-700' : 'text-zinc-300'}`}>
              <span className="flex items-center gap-1.5">
                <Crown size={12} className="text-amber-500" /> Nueva Clave Maestra
              </span>
            </label>
            <div className="relative">
              <input
                type={showInputMaster ? "text" : "password"}
                value={inputMaster}
                onChange={(e) => setInputMaster(e.target.value)}
                placeholder="ej. AdminMaster2026#"
                required
                className={`w-full rounded-xl px-3.5 py-2.5 pr-10 text-xs font-mono outline-none transition-all ${
                  isDayMode
                    ? 'bg-white border border-zinc-300 text-zinc-900 focus:border-amber-500'
                    : 'bg-black/60 border border-white/15 text-white focus:border-amber-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowInputMaster(!showInputMaster)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors cursor-pointer ${
                  isDayMode ? 'text-zinc-400 hover:text-zinc-700' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title={showInputMaster ? "Ocultar texto" : "Mostrar texto"}
              >
                <Eye size={14} />
              </button>
            </div>
          </div>

          {/* Nuevo PIN de Editor */}
          <div className="flex flex-col gap-1.5">
            <label className={`text-[11px] font-bold flex items-center justify-between ${isDayMode ? 'text-zinc-700' : 'text-zinc-300'}`}>
              <span className="flex items-center gap-1.5">
                <Edit2 size={12} className="text-sky-400" /> Nuevo PIN de Editor
              </span>
            </label>
            <div className="relative">
              <input
                type={showInputEditor ? "text" : "password"}
                value={inputEditor}
                onChange={(e) => setInputEditor(e.target.value)}
                placeholder="ej. 123456"
                required
                className={`w-full rounded-xl px-3.5 py-2.5 pr-10 text-xs font-mono outline-none transition-all ${
                  isDayMode
                    ? 'bg-white border border-zinc-300 text-zinc-900 focus:border-sky-500'
                    : 'bg-black/60 border border-white/15 text-white focus:border-sky-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowInputEditor(!showInputEditor)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors cursor-pointer ${
                  isDayMode ? 'text-zinc-400 hover:text-zinc-700' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title={showInputEditor ? "Ocultar texto" : "Mostrar texto"}
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
            className="px-6 py-2.5 rounded-xl bg-[#b41d1d] hover:bg-[#cf2424] text-white font-black text-xs uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(180,29,29,0.35)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 active:scale-95"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>Actualizar Claves</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
