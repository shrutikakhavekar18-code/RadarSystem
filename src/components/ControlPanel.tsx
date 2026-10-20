import React, { useState } from 'react';
import { Play, Square, Lightbulb, Sliders, CheckCircle2, Clock, AlertTriangle, Navigation, Zap } from 'lucide-react';
import { RadarControls, CommandAck } from '../types/radar';

interface ControlPanelProps {
  controls: RadarControls;
  onUpdateControls: (updates: Partial<RadarControls>) => Promise<void>;
  lastAck: CommandAck | null;
  pendingCommandId: string | null;
  commandLatencyMs: number | null;
  isAuthenticated: boolean;
  onOpenAuth: () => void;
  isSimulated: boolean;
  isHardwareOnline: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  controls,
  onUpdateControls,
  lastAck,
  pendingCommandId,
  commandLatencyMs,
  isAuthenticated,
  onOpenAuth,
  isSimulated,
  isHardwareOnline,
}) => {
  const [localThreshold, setLocalThreshold] = useState<number>(controls.threshold);
  const [localManualAngle, setLocalManualAngle] = useState<number>(controls.manualSteerAngle || 90);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleToggleScan = async () => {
    setIsUpdating(true);
    const nextState = !controls.scanning;
    try {
      await onUpdateControls({ scanning: nextState });
      setFeedbackMsg(`Scan ${nextState ? 'Started' : 'Paused'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSetLEDMode = async (mode: 'AUTO' | 'ON' | 'OFF') => {
    setIsUpdating(true);
    try {
      await onUpdateControls({ ledMode: mode, led: mode === 'ON' });
      setFeedbackMsg(`LED Mode: ${mode}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleThresholdCommit = async (val: number) => {
    setLocalThreshold(val);
    setIsUpdating(true);
    try {
      await onUpdateControls({ threshold: val });
      setFeedbackMsg(`Threshold: ${val}cm`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleManualMode = async (manual: boolean) => {
    setIsUpdating(true);
    try {
      await onUpdateControls({ manualMode: manual });
      setFeedbackMsg(`Mode: ${manual ? 'Manual Aim' : 'Auto Sweep'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSteerCommit = async (angle: number) => {
    setLocalManualAngle(angle);
    setIsUpdating(true);
    try {
      await onUpdateControls({ manualSteerAngle: angle });
      setFeedbackMsg(`Heading: ${angle}°`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSpeedCommit = async (speedMs: number) => {
    setIsUpdating(true);
    try {
      await onUpdateControls({ scanSpeedMs: speedMs });
      setFeedbackMsg(`Speed: ${speedMs}ms`);
    } finally {
      setIsUpdating(false);
    }
  };

  const currentLedMode = controls.ledMode || (controls.led ? 'ON' : 'AUTO');

  return (
    <div className="bg-[#090d15] border border-slate-800 rounded-lg p-5 flex flex-col gap-5">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
            Hardware Command Matrix
          </h2>
        </div>
        <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
          <span>DEST: /radar/commands/*</span>
        </div>
      </div>

      {/* Auth Warning if not authenticated and not in simulated mode */}
      {!isAuthenticated && !isSimulated && (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded p-3 text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Admin sign-in required to write to /radar/commands/*</span>
          </div>
          <button
            onClick={onOpenAuth}
            className="px-2.5 py-1 text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded whitespace-nowrap"
          >
            Sign In
          </button>
        </div>
      )}

      {/* Primary Toggles Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* SCANNER CONTROL (/radar/commands/scanEnabled) */}
        <button
          onClick={handleToggleScan}
          disabled={isUpdating}
          className={`flex items-center justify-between p-3.5 rounded-lg border transition-all text-left ${
            controls.scanning
              ? 'bg-emerald-950/40 border-emerald-500/50 hover:bg-emerald-900/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded ${controls.scanning ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
              {controls.scanning ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            </div>
            <div>
              <div className="text-[11px] font-mono text-slate-400">/radar/commands/scanEnabled</div>
              <div className="text-sm font-bold font-mono text-slate-100">
                {controls.scanning ? 'SCANNING ACTIVE' : 'SWEEP PAUSED'}
              </div>
            </div>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-950/60 border border-slate-800">
            {controls.scanning ? 'STOP' : 'START'}
          </span>
        </button>

        {/* LED MODE CONTROL (/radar/commands/ledMode) */}
        <div className="bg-[#0b0f19] border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className={`w-4 h-4 ${currentLedMode === 'ON' ? 'text-amber-400' : 'text-slate-400'}`} />
              <div className="text-[11px] font-mono text-slate-400">/radar/commands/ledMode</div>
            </div>
            <span className="text-xs font-bold font-mono text-amber-300">{currentLedMode}</span>
          </div>

          <div className="flex items-center gap-1 mt-2.5 bg-slate-900 border border-slate-800 p-0.5 rounded">
            {(['AUTO', 'ON', 'OFF'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleSetLEDMode(mode)}
                disabled={isUpdating}
                className={`flex-1 py-1 text-xs font-mono rounded transition-colors ${
                  currentLedMode === mode
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* DETECTION THRESHOLD SLIDER (/radar/commands/thresholdCm) */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-mono uppercase text-slate-300">Detection Proximity Threshold</span>
            <p className="text-[11px] text-slate-500 font-mono">/radar/commands/thresholdCm</p>
          </div>
          <div className="text-right">
            <span className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
              {localThreshold}
            </span>
            <span className="text-xs font-mono text-slate-400 ml-1">CM</span>
          </div>
        </div>

        {/* Range input */}
        <input
          type="range"
          min="5"
          max="50"
          step="1"
          value={localThreshold}
          onChange={(e) => setLocalThreshold(Number(e.target.value))}
          onMouseUp={(e) => handleThresholdCommit(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => handleThresholdCommit(Number((e.target as HTMLInputElement).value))}
          className="w-full accent-emerald-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
        />

        {/* Threshold presets */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {[10, 20, 25, 35, 45].map((preset) => (
            <button
              key={preset}
              onClick={() => handleThresholdCommit(preset)}
              className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
                localThreshold === preset
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500/60'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {preset}cm
            </button>
          ))}
        </div>
      </div>

      {/* SCANNING MODE: AUTO SWEEP VS MANUAL AIM */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase text-slate-400">Servo Sweep Control</span>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded">
            <button
              onClick={() => handleToggleManualMode(false)}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                !controls.manualMode
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Auto 0°–180°
            </button>
            <button
              onClick={() => handleToggleManualMode(true)}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                controls.manualMode
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Manual Aim
            </button>
          </div>
        </div>

        {/* Manual Steer Angle Slider (Visible when Manual Aim is active) */}
        {controls.manualMode && (
          <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                Target Azimuth Direction:
              </span>
              <span className="text-emerald-400 font-bold tabular-nums text-sm">
                {localManualAngle}°
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="180"
              step="5"
              value={localManualAngle}
              onChange={(e) => setLocalManualAngle(Number(e.target.value))}
              onMouseUp={(e) => handleSteerCommit(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => handleSteerCommit(Number((e.target as HTMLInputElement).value))}
              className="w-full accent-emerald-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>0° (Right)</span>
              <span>90° (Center)</span>
              <span>180° (Left)</span>
            </div>
          </div>
        )}

        {/* Scan Speed Selector */}
        {!controls.manualMode && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <span className="text-xs font-mono text-slate-400">Step Interval:</span>
            <div className="flex items-center gap-1.5">
              {[
                { label: 'Fast (15ms)', ms: 15 },
                { label: 'Normal (30ms)', ms: 30 },
                { label: 'Slow (50ms)', ms: 50 },
              ].map((sp) => (
                <button
                  key={sp.ms}
                  onClick={() => handleSpeedCommit(sp.ms)}
                  className={`px-2 py-0.5 text-xs font-mono rounded border transition-colors ${
                    controls.scanSpeedMs === sp.ms
                      ? 'bg-slate-800 text-emerald-300 border-emerald-800'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-300'
                  }`}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* COMMAND ACKNOWLEDGEMENT & TELEMETRY FOOTER */}
      <div className="bg-[#070a0f] border border-slate-800/80 rounded-lg p-3 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {pendingCommandId ? (
            <span className="text-emerald-400 flex items-center gap-1.5 animate-pulse">
              <Clock className="w-3.5 h-3.5" />
              <span>DISPATCHING {pendingCommandId.substring(0, 10)}...</span>
            </span>
          ) : lastAck ? (
            <span className="text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>ACK: {lastAck.lastProcessedCommandId.substring(0, 12)} ({lastAck.status})</span>
            </span>
          ) : (
            <span className="text-slate-500 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-slate-600" />
              <span>COMMAND CHANNEL READY</span>
            </span>
          )}
        </div>

        <div className="text-slate-500 text-[11px] flex items-center gap-2">
          {commandLatencyMs !== null && (
            <span>ROUNDTRIP: {commandLatencyMs}ms</span>
          )}
          {feedbackMsg && (
            <span className="text-slate-300">· {feedbackMsg}</span>
          )}
        </div>
      </div>
    </div>
  );
};
