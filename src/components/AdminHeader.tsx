import React from 'react';
import { Shield, Volume2, VolumeX, Cpu, Radio, LogIn, LogOut, BookOpen, Settings } from 'lucide-react';
import { User } from 'firebase/auth';
import { ESPStatus } from '../types/radar';

interface AdminHeaderProps {
  user: User | null;
  status: ESPStatus;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onOpenFirmwareGuide: () => void;
  onOpenRulesGuide: () => void;
  isSimulated: boolean;
  onToggleSimulator: () => void;
  rtdbConnected: boolean;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  user,
  status,
  soundEnabled,
  onToggleSound,
  onOpenAuth,
  onSignOut,
  onOpenFirmwareGuide,
  onOpenRulesGuide,
  isSimulated,
  onToggleSimulator,
  rtdbConnected,
}) => {
  // Determine if real ESP32 is actively pinging (heartbeat received within last 8 seconds)
  const isHeartbeatFresh = status.lastHeartbeat > 0 && Date.now() - status.lastHeartbeat < 8000;
  const isHardwareOnline = status.online && isHeartbeatFresh;

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-[#090d15] shrink-0">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
        <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
          <Radio className="w-4 h-4 animate-pulse" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-slate-100 flex items-center gap-2">
            RadarSystem <span className="text-cyan-400 font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/40">ADMIN // ESP32</span>
          </h1>
        </div>
      </div>

      {/* Zone 2: Navigation & documentation action links */}
      <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-400">
        <button
          onClick={onOpenFirmwareGuide}
          className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0"
        >
          <BookOpen className="w-4 h-4" />
          <span>ESP32 Firmware & Wiring</span>
        </button>
        <button
          onClick={onOpenRulesGuide}
          className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0"
        >
          <Settings className="w-4 h-4" />
          <span>Firebase Rules & Schema</span>
        </button>
        
        {/* Hardware Status Indicator (Text-first, non-hue-only) */}
        <div className="flex items-center gap-2 pl-4 border-l border-slate-800 text-xs font-mono">
          {isSimulated ? (
            <span className="text-amber-400 flex items-center gap-1.5 bg-amber-950/40 border border-amber-800/40 px-2 py-1 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
              SIMULATOR ACTIVE
            </span>
          ) : isHardwareOnline ? (
            <span className="text-emerald-400 flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-800/40 px-2 py-1 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              ESP32 ONLINE {status.ip ? `(${status.ip})` : ''}
            </span>
          ) : (
            <span className="text-rose-400 flex items-center gap-1.5 bg-rose-950/40 border border-rose-800/40 px-2 py-1 rounded" title="No heartbeat received from physical ESP32 in last 8s">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              ESP32 OFFLINE
            </span>
          )}
        </div>
      </nav>

      {/* Zone 3: Primary Action & Session controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Simulator toggle button */}
        <button
          onClick={onToggleSimulator}
          title="Toggle built-in simulated radar sweep for presentation without physical hardware"
          className={`px-2.5 py-1.5 text-xs font-mono rounded border transition-colors whitespace-nowrap ${
            isSimulated
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          {isSimulated ? 'Exit Sim' : 'Demo Sim Mode'}
        </button>

        {/* Audio Ping Toggle */}
        <button
          onClick={onToggleSound}
          className={`p-2 rounded border transition-colors ${
            soundEnabled
              ? 'bg-cyan-950/60 border-cyan-800/60 text-cyan-400 hover:bg-cyan-900/60'
              : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
          title={soundEnabled ? 'Sonar sound alerts enabled' : 'Sonar sound alerts muted'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Auth Admin Profile / Login */}
        {user ? (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-slate-200 truncate max-w-[140px]">{user.email || 'Admin'}</div>
              <div className="text-[10px] font-mono text-emerald-400 uppercase">Authenticated</div>
            </div>
            <button
              onClick={onSignOut}
              className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-900/50 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 border border-cyan-400/40 rounded shadow-sm shadow-cyan-950 transition-colors whitespace-nowrap"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Admin Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
