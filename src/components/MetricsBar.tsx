import React from 'react';
import { Compass, Gauge, AlertCircle, Lightbulb, Wifi, Play, Square, Activity } from 'lucide-react';
import { TelemetryData, ESPStatus, RadarControls, HardwareLinkState } from '../types/radar';

interface MetricsBarProps {
  telemetry: TelemetryData;
  status: ESPStatus;
  controls: RadarControls;
  latencyMs: number | null;
  linkState: HardwareLinkState;
  lastUpdateEpoch: number;
}

export const MetricsBar: React.FC<MetricsBarProps> = ({
  telemetry,
  status,
  controls,
  latencyMs,
  linkState,
  lastUpdateEpoch,
}) => {
  const isDetected = telemetry.objectDetected || (telemetry.distanceCm > 0 && telemetry.distanceCm <= controls.threshold);
  const isValidDist = telemetry.distanceCm > 0 && telemetry.distanceCm <= 100;
  const lastUpdateSec = Math.max(0, Math.round((Date.now() - lastUpdateEpoch) / 1000));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 w-full">
      {/* 1. SERVO ANGLE */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>REPORTED ANGLE</span>
          <Compass className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold font-mono tabular-nums text-slate-100">
            {telemetry.servoAngle}
          </span>
          <span className="text-xs font-mono uppercase text-slate-400">DEG</span>
        </div>
        <div className="mt-1 text-[11px] font-mono text-slate-500 flex items-center justify-between">
          <span>DIR: {telemetry.direction === 'ccw' ? '180°→0° (CCW)' : '0°→180° (CW)'}</span>
        </div>
      </div>

      {/* 2. ULTRASONIC DISTANCE */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>MEASURED DISTANCE</span>
          <Gauge className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className={`text-2xl font-bold font-mono tabular-nums ${
            isDetected ? 'text-rose-400' : 'text-slate-100'
          }`}>
            {isValidDist ? telemetry.distanceCm.toFixed(1) : '---'}
          </span>
          <span className="text-xs font-mono uppercase text-slate-400">
            {isValidDist ? 'CM' : 'NO ECHO'}
          </span>
        </div>
        <div className="mt-1 text-[11px] font-mono text-slate-500">
          LIMIT: {controls.threshold} CM
        </div>
      </div>

      {/* 3. DETECTION STATUS */}
      <div className={`border rounded-lg p-3.5 flex flex-col justify-between transition-colors ${
        isDetected
          ? 'bg-rose-950/20 border-rose-800/60'
          : 'bg-[#0b0f19] border-slate-800'
      }`}>
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>CONTACT STATE</span>
          <AlertCircle className={`w-3.5 h-3.5 ${isDetected ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`} />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className={`text-base font-bold font-mono tracking-tight uppercase ${
            isDetected ? 'text-rose-400' : 'text-emerald-400'
          }`}>
            {isDetected ? 'OBJECT DETECTED' : 'SECTOR CLEAR'}
          </span>
        </div>
        <div className="mt-1 text-[11px] font-mono text-slate-500">
          {isDetected ? `${telemetry.distanceCm}cm <= ${controls.threshold}cm` : 'No Breach Detected'}
        </div>
      </div>

      {/* 4. HARDWARE LED STATE */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>STATUS LED</span>
          <Lightbulb className={`w-3.5 h-3.5 ${telemetry.ledOn ? 'text-amber-400' : 'text-slate-600'}`} />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className={`text-2xl font-bold font-mono tabular-nums ${
            telemetry.ledOn ? 'text-amber-400' : 'text-slate-400'
          }`}>
            {telemetry.ledOn ? 'ON' : 'OFF'}
          </span>
          <span className="text-[11px] font-mono uppercase text-slate-500 ml-1">
            ({telemetry.ledMode || controls.ledMode})
          </span>
        </div>
        <div className="mt-1 text-[11px] font-mono text-slate-500">
          ACTUATOR GPIO 2
        </div>
      </div>

      {/* 5. HARDWARE SCANNING STATUS */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>SCANNING STATUS</span>
          {telemetry.scanningEnabled ? (
            <Play className="w-3.5 h-3.5 text-emerald-400 fill-current" />
          ) : (
            <Square className="w-3.5 h-3.5 text-slate-600 fill-current" />
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className={`text-base font-bold font-mono uppercase ${
            telemetry.scanningEnabled ? 'text-emerald-400' : 'text-amber-400'
          }`}>
            {telemetry.scanningEnabled ? 'SWEEPING' : 'PAUSED'}
          </span>
        </div>
        <div className="mt-1 text-[11px] font-mono text-slate-500">
          {controls.manualMode ? 'Manual Aim Active' : '0°–180° Continuous'}
        </div>
      </div>

      {/* 6. HARDWARE LINK STATUS (LIVE / STALE / OFFLINE) */}
      <div className={`border rounded-lg p-3.5 flex flex-col justify-between transition-colors ${
        linkState === 'LIVE'
          ? 'bg-[#0b0f19] border-emerald-900/50'
          : linkState === 'STALE'
          ? 'bg-amber-950/20 border-amber-800/50'
          : 'bg-rose-950/20 border-rose-800/50'
      }`}>
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>ESP32 LINK</span>
          <Wifi className={`w-3.5 h-3.5 ${
            linkState === 'LIVE' ? 'text-emerald-400' : linkState === 'STALE' ? 'text-amber-400' : 'text-rose-400'
          }`} />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className={`text-base font-bold font-mono uppercase ${
            linkState === 'LIVE' ? 'text-emerald-400' : linkState === 'STALE' ? 'text-amber-400' : 'text-rose-400'
          }`}>
            {linkState}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {lastUpdateSec}s ago
          </span>
        </div>
        <div className="mt-1 text-[11px] font-mono text-slate-500 truncate">
          {telemetry.uptimeMs ? `Uptime: ${(telemetry.uptimeMs / 1000).toFixed(0)}s` : latencyMs ? `${latencyMs}ms ping` : 'Persistent Stream'}
        </div>
      </div>
    </div>
  );
};
