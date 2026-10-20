import React, { useState } from 'react';
import { X, Copy, Check, Shield, Database, Lock, Key } from 'lucide-react';

interface FirebaseRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirebaseRulesModal: React.FC<FirebaseRulesModalProps> = ({ isOpen, onClose }) => {
  const [copiedRules, setCopiedRules] = useState(false);

  if (!isOpen) return null;

  const rtdbRules = `{
  "rules": {
    "radar": {
      "telemetry": {
        ".read": true,
        ".write": true
      },
      "status": {
        ".read": true,
        ".write": true
      },
      "controls": {
        ".read": true,
        ".write": "auth != null"
      },
      "acknowledgements": {
        ".read": true,
        ".write": true
      },
      "history": {
        ".read": true,
        ".write": true
      }
    }
  }
}`;

  const devTestRules = `{
  "rules": {
    ".read": true,
    ".write": true
  }
}`;

  const handleCopyRules = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRules(true);
    setTimeout(() => setCopiedRules(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#090d15] border border-slate-800 rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0c121e]">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">
              Firebase Security Rules & Admin Auth Guide
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6 text-slate-300">
          {/* SECTION 1: AUTHENTICATION SETUP */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
              <Key className="w-4 h-4" />
              <span>1. Firebase Authentication Settings (Admin Only)</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              As required, public self-registration is disabled. Only authorized administrators created in the Firebase Console can sign in and dispatch controls to the hardware:
            </p>
            <div className="bg-[#05070c] border border-slate-800 rounded-lg p-4 space-y-2 text-slate-300">
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">Step 1:</span>
                <span>Go to <strong className="text-slate-100">Firebase Console &gt; Authentication &gt; Sign-in method</strong>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">Step 2:</span>
                <span>Enable the <strong className="text-slate-100">Email/Password</strong> provider (leave Email Link / Passwordless disabled).</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">Step 3:</span>
                <span>Click the <strong className="text-slate-100">Users</strong> tab &gt; click <strong className="text-cyan-300">"Add user"</strong>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">Step 4:</span>
                <span>Enter an admin email (e.g. <code className="text-amber-300">admin@radar.local</code> or your email) and choose a secure password.</span>
              </div>
            </div>
          </div>

          {/* SECTION 2: RTDB SECURITY RULES */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                <Lock className="w-4 h-4" />
                <span>2. Production Realtime Database Security Rules</span>
              </div>
              <button
                onClick={() => handleCopyRules(rtdbRules)}
                className="flex items-center gap-1.5 px-3 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 rounded transition-colors"
              >
                {copiedRules ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copy Rules JSON</span>
              </button>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Navigate to <strong className="text-slate-200">Firebase Console &gt; Realtime Database &gt; Rules</strong>. Paste this configuration:
            </p>
            <pre className="p-4 bg-[#05070c] border border-slate-800 rounded-lg overflow-x-auto text-slate-300 leading-relaxed">
              {rtdbRules}
            </pre>
            <div className="text-[11px] text-slate-400 space-y-1">
              <div>• <code className="text-cyan-400">telemetry</code> & <code className="text-cyan-400">status</code>: Public read, ESP32 write.</div>
              <div>• <code className="text-cyan-400">controls</code>: Public read, restricted to authenticated admins (<code className="text-amber-300">auth != null</code>) for write.</div>
            </div>
          </div>

          {/* SECTION 3: QUICK DEMO / TESTING RULES */}
          <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg p-4 flex flex-col gap-2">
            <div className="text-amber-300 font-bold flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              <span>Alternative: Open Test Mode (For immediate project defense)</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              If your database currently gives "Permission Denied" errors and you haven't configured authentication rules yet, you can temporarily set test mode rules:
            </p>
            <pre className="p-2.5 bg-black/50 border border-slate-800 rounded text-slate-300 text-[11px]">
              {devTestRules}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-[#0c121e] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-900 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
