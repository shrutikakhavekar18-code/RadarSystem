import React, { useState } from 'react';
import { X, Shield, Lock, Mail, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDemoBypassLogin: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onDemoBypassLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both admin email and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      onClose();
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      console.error('Firebase Auth sign in error:', error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setErrorMsg('Invalid admin credentials. Have you created an admin user in your Firebase Console?');
      } else if (error.code === 'auth/operation-not-allowed') {
        setErrorMsg('Email/Password provider is not enabled in Firebase Console > Authentication > Sign-in method.');
      } else if (error.code === 'auth/too-many-requests') {
        setErrorMsg('Too many unsuccessful attempts. Please wait a moment.');
      } else {
        setErrorMsg(error.message || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="bg-[#090d15] border border-slate-800 rounded-xl max-w-md w-full shadow-2xl overflow-hidden font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0c121e]">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Admin Authentication
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 flex flex-col gap-5">
          <p className="text-slate-400 leading-relaxed font-sans text-xs">
            Admin access is required to transmit remote control signals (scan start/stop, LED actuators, threshold calibration) to the ESP32.
          </p>

          {errorMsg && (
            <div className="bg-rose-950/40 border border-rose-800/60 p-3 rounded text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSignIn} className="flex flex-col gap-3.5">
            <div>
              <label className="block text-slate-300 text-xs mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-cyan-400" />
                <span>Admin Email</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@radar.local"
                className="w-full bg-[#05070c] border border-slate-800 rounded px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-slate-300 text-xs mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Password</span>
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#05070c] border border-slate-800 rounded px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <span>Verifying Credentials...</span>
              ) : (
                <>
                  <span>Sign In as Administrator</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* College Project Demo Bypass */}
          <div className="pt-4 border-t border-slate-800/80 flex flex-col gap-2">
            <div className="text-[11px] text-slate-500">
              Evaluating or testing before adding users in Firebase Console?
            </div>
            <button
              type="button"
              onClick={() => {
                onDemoBypassLogin();
                onClose();
              }}
              className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-300 rounded text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Use Project Evaluation Demo Session</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
