/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  auth,
  subscribeToRTDBConnection,
  subscribeToTelemetry,
  sendRadarControlUpdate,
  recordDetectionEvent,
} from './services/firebase';
import { TelemetryData, ESPStatus, RadarControls, CommandAck, DetectionEvent, HardwareLinkState } from './types/radar';
import { PlottedDetection } from './components/RadarCanvas';
import { radarAudio } from './utils/audio';
import { AdminHeader } from './components/AdminHeader';
import { MetricsBar } from './components/MetricsBar';
import { RadarCanvas } from './components/RadarCanvas';
import { ControlPanel } from './components/ControlPanel';
import { DetectionHistory } from './components/DetectionHistory';
import { FirmwareGuideModal } from './components/FirmwareGuideModal';
import { FirebaseRulesModal } from './components/FirebaseRulesModal';
import { AuthModal } from './components/AuthModal';

const DEFAULT_CONTROLS: RadarControls = {
  scanning: true,
  ledMode: 'AUTO',
  led: false,
  threshold: 25,
  scanSpeedMs: 30,
  minAngle: 0,
  maxAngle: 180,
  manualMode: false,
  manualSteerAngle: 90,
};

const DEFAULT_STATUS: ESPStatus = {
  online: false,
  lastHeartbeat: 0,
  linkState: 'OFFLINE',
  firmwareVersion: '1.2.0',
};

const DEFAULT_TELEMETRY: TelemetryData = {
  servoAngle: 90,
  distanceCm: 34.2,
  objectDetected: false,
  thresholdCm: 25,
  ledOn: false,
  ledMode: 'AUTO',
  scanningEnabled: true,
  online: false,
  timestamp: Date.now(),
  direction: 'cw',
};

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isDemoAdmin, setIsDemoAdmin] = useState<boolean>(false);

  // Live Firebase Telemetry State
  const [telemetry, setTelemetry] = useState<TelemetryData>(DEFAULT_TELEMETRY);
  const [status, setStatus] = useState<ESPStatus>(DEFAULT_STATUS);
  const [controls, setControls] = useState<RadarControls>(DEFAULT_CONTROLS);
  const [lastAck, setLastAck] = useState<CommandAck | null>(null);
  const [rtdbConnected, setRtdbConnected] = useState<boolean>(false);
  const [lastUpdateEpoch, setLastUpdateEpoch] = useState<number>(0);
  const [linkState, setLinkState] = useState<HardwareLinkState>('OFFLINE');

  // Command State
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);
  const [commandLatencyMs, setCommandLatencyMs] = useState<number | null>(null);
  const commandSentAtRef = useRef<number | null>(null);

  // Plotted Radar Detection Points (Retained with fade)
  const [plottedDetections, setPlottedDetections] = useState<PlottedDetection[]>([]);
  const [detectionEvents, setDetectionEvents] = useState<DetectionEvent[]>([]);
  const lastAlertTimeRef = useRef<number>(0);

  // UI Modals & Settings
  const [isFirmwareOpen, setIsFirmwareOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Demonstration Simulation Mode (Explicitly distinguished)
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const simAngleRef = useRef<number>(90);
  const simDirectionRef = useRef<number>(1);
  const simTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Listen for Firebase Auth user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        setIsDemoAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Persistent Firebase Realtime Database Telemetry Listener on /radar/telemetry
  useEffect(() => {
    const unsubConn = subscribeToRTDBConnection((connected) => {
      setRtdbConnected(connected);
    });

    const unsubTele = subscribeToTelemetry((data, arrivalEpoch) => {
      if (isSimulated) return;

      if (data) {
        setTelemetry(data);
        setLastUpdateEpoch(arrivalEpoch);

        // Update link state immediately
        setLinkState('LIVE');
        setStatus((prev) => ({
          ...prev,
          online: data.online,
          lastHeartbeat: arrivalEpoch,
          linkState: 'LIVE',
          lastUpdateEpoch: arrivalEpoch,
        }));

        // Keep local controls synced with hardware state
        setControls((prev) => ({
          ...prev,
          scanning: data.scanningEnabled,
          threshold: data.thresholdCm,
          led: data.ledOn,
          ledMode: (data.ledMode as 'AUTO' | 'ON' | 'OFF') || prev.ledMode,
        }));

        // Plot detection point if objectDetected is true and distance is valid
        handleNewTelemetrySample(data, arrivalEpoch);
      }
    });

    return () => {
      unsubConn();
      unsubTele();
    };
  }, [isSimulated]);

  // 3. Periodic Link Health Checker (Re-evaluates LIVE / STALE / OFFLINE)
  useEffect(() => {
    const interval = setInterval(() => {
      if (isSimulated) {
        setLinkState('LIVE');
        return;
      }

      if (lastUpdateEpoch === 0) {
        setLinkState('OFFLINE');
        return;
      }

      const elapsed = Date.now() - lastUpdateEpoch;
      if (elapsed < 3500) {
        setLinkState('LIVE');
      } else if (elapsed < 8000) {
        setLinkState('STALE');
      } else {
        setLinkState('OFFLINE');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastUpdateEpoch, isSimulated]);

  // 4. Handle incoming telemetry sample for detection plotting
  const handleNewTelemetrySample = useCallback((data: TelemetryData, nowTs: number) => {
    const dist = data.distanceCm;
    const maxRange = 50;

    // Strict validation: Reject 0, negative, > maxRange, or 999 "no echo"
    const isValidDistance = dist > 0 && dist <= maxRange && dist !== 999;
    const isDetected = data.objectDetected || (isValidDistance && dist <= data.thresholdCm);

    if (isDetected && isValidDistance) {
      // Play tactical sonar ping
      radarAudio.playDetectionPing(dist, data.thresholdCm);

      // Add to plotted points on canvas
      setPlottedDetections((prev) => {
        // Mark all older points as not latest
        const older = prev.map((p) => ({ ...p, isLatest: false }));
        // Add new point at exact reported servoAngle and distance
        const newPt: PlottedDetection = {
          id: 'pt_' + nowTs + '_' + Math.random().toString(36).substring(2, 5),
          angle: data.servoAngle,
          distance: dist,
          x: 0,
          y: 0,
          timestamp: nowTs,
          isLatest: true,
          severity: dist <= 15 ? 'critical' : 'warning',
        };
        // Retain latest 40 points
        return [newPt, ...older.slice(0, 39)];
      });

      // Throttle logging to incident history
      if (nowTs - lastAlertTimeRef.current > 750) {
        lastAlertTimeRef.current = nowTs;
        const newEvent: DetectionEvent = {
          id: 'ev_' + nowTs + '_' + Math.random().toString(36).substring(2, 5),
          timestamp: nowTs,
          angle: data.servoAngle,
          distance: dist,
          threshold: data.thresholdCm,
          severity: dist <= 15 ? 'critical' : 'warning',
        };
        setDetectionEvents((prev) => [newEvent, ...prev.slice(0, 99)]);
        recordDetectionEvent(newEvent);
      }
    }
  }, []);

  // 5. Demonstration Simulation Mode (Runs only when user clicks Demo Sim)
  useEffect(() => {
    if (!isSimulated) {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
      return;
    }

    const intervalMs = Math.max(15, controls.scanSpeedMs || 30);

    simTimerRef.current = setInterval(() => {
      let currentAngle = simAngleRef.current;
      let dir = simDirectionRef.current;

      if (controls.manualMode) {
        currentAngle = controls.manualSteerAngle;
        simAngleRef.current = currentAngle;
      } else if (controls.scanning) {
        currentAngle += dir * 2;
        if (currentAngle >= 180) {
          currentAngle = 180;
          dir = -1;
        } else if (currentAngle <= 0) {
          currentAngle = 0;
          dir = 1;
        }
        simAngleRef.current = currentAngle;
        simDirectionRef.current = dir;
      }

      // Synthesize realistic distance with obstacles around 42-52 deg and 122-136 deg
      let dist = 48.0;
      if (currentAngle >= 40 && currentAngle <= 54) {
        dist = 18.2 + Math.sin(currentAngle * 0.1) * 2;
      } else if (currentAngle >= 120 && currentAngle <= 138) {
        dist = 12.4 + Math.cos(currentAngle * 0.2) * 1.5;
      } else {
        dist = 42.0 + Math.random() * 5;
      }

      const isDetected = dist <= controls.threshold;
      const now = Date.now();

      const simTele: TelemetryData = {
        servoAngle: currentAngle,
        distanceCm: Number(dist.toFixed(1)),
        objectDetected: isDetected,
        thresholdCm: controls.threshold,
        ledOn: isDetected || controls.ledMode === 'ON',
        ledMode: controls.ledMode,
        scanningEnabled: controls.scanning,
        online: true,
        timestamp: now,
        direction: dir === 1 ? 'cw' : 'ccw',
        uptimeMs: now - 1700000000000,
      };

      setTelemetry(simTele);
      setLastUpdateEpoch(now);
      setLinkState('LIVE');

      handleNewTelemetrySample(simTele, now);
    }, intervalMs);

    return () => {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
    };
  }, [isSimulated, controls.scanning, controls.manualMode, controls.manualSteerAngle, controls.threshold, controls.scanSpeedMs, controls.ledMode, handleNewTelemetrySample]);

  // 6. Remote Admin Controls Handler
  const handleUpdateControls = async (updates: Partial<RadarControls>) => {
    const updatedState = { ...controls, ...updates };
    setControls(updatedState);

    if (isSimulated) {
      radarAudio.playCommandAck();
      setCommandLatencyMs(14);
      setLastAck({
        lastProcessedCommandId: 'sim_' + Date.now().toString(36),
        status: 'SUCCESS',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      commandSentAtRef.current = Date.now();
      const res = await sendRadarControlUpdate(updates);
      setPendingCommandId(res.commandId);
      radarAudio.playCommandAck();

      // Clear pending state after 4 seconds
      setTimeout(() => {
        setPendingCommandId((curr) => (curr === res.commandId ? null : curr));
      }, 4000);
    } catch (err) {
      console.error('Failed to send radar control update:', err);
      alert('Firebase write failed. Ensure you are signed in as Admin or have configured Realtime Database rules!');
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    radarAudio.setEnabled(next);
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setIsDemoAdmin(false);
  };

  const handleClearDetections = () => {
    setPlottedDetections([]);
  };

  const isAuthenticated = Boolean(currentUser) || isDemoAdmin;

  return (
    <div className="min-h-screen bg-[#05080c] text-slate-100 flex flex-col font-sans bg-radar-grid selection:bg-emerald-500/20">
      {/* Top Header Bar */}
      <AdminHeader
        user={currentUser || (isDemoAdmin ? ({ email: 'demo.admin@radar.edu' } as User) : null)}
        status={status}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSignOut={handleSignOut}
        onOpenFirmwareGuide={() => setIsFirmwareOpen(true)}
        onOpenRulesGuide={() => setIsRulesOpen(true)}
        isSimulated={isSimulated}
        onToggleSimulator={() => setIsSimulated(!isSimulated)}
        rtdbConnected={rtdbConnected}
      />

      {/* Main Dashboard Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-4 md:p-6 flex flex-col gap-5">
        {/* Hardware Status Banner when real ESP32 is offline and not in simulation */}
        {linkState === 'OFFLINE' && !isSimulated && (
          <div className="bg-[#0b101c] border border-amber-500/30 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2.5 text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0"></span>
              <span>
                <strong>AWAITING PHYSICAL ESP32:</strong> No live telemetry detected at <code className="text-emerald-400">/radar/telemetry</code>.
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setIsSimulated(true)}
                className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded transition-colors whitespace-nowrap"
              >
                Enable Demo Simulation
              </button>
              <button
                onClick={() => setIsFirmwareOpen(true)}
                className="text-emerald-400 hover:text-emerald-300 underline underline-offset-4 whitespace-nowrap"
              >
                View ESP32 Code & Wiring
              </button>
            </div>
          </div>
        )}

        {/* 1. Engineering Telemetry Metrics Bar */}
        <MetricsBar
          telemetry={telemetry}
          status={status}
          controls={controls}
          latencyMs={commandLatencyMs}
          linkState={linkState}
          lastUpdateEpoch={lastUpdateEpoch}
        />

        {/* 2. Asymmetric Split Workspace: Radar Canvas (Left/Center) + Command Matrix (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Radar Screen Visualizer (7 Columns) */}
          <div className="lg:col-span-7 bg-[#030708] border border-emerald-950/80 rounded-lg flex flex-col min-h-[460px] shadow-2xl overflow-hidden">
            <RadarCanvas
              telemetry={telemetry}
              threshold={controls.threshold}
              maxRangeCm={50}
              isScanning={controls.scanning}
              linkState={linkState}
              lastUpdateEpoch={lastUpdateEpoch}
              manualMode={controls.manualMode}
              onManualAngleSelect={(angle) => {
                if (controls.manualMode) {
                  handleUpdateControls({ manualSteerAngle: angle });
                }
              }}
              detectionPoints={plottedDetections}
              onClearDetections={handleClearDetections}
            />
          </div>

          {/* Hardware Controls Matrix (5 Columns) */}
          <div className="lg:col-span-5 flex flex-col">
            <ControlPanel
              controls={controls}
              onUpdateControls={handleUpdateControls}
              lastAck={lastAck}
              pendingCommandId={pendingCommandId}
              commandLatencyMs={commandLatencyMs}
              isAuthenticated={isAuthenticated}
              onOpenAuth={() => setIsAuthOpen(true)}
              isSimulated={isSimulated}
              isHardwareOnline={linkState === 'LIVE'}
            />
          </div>
        </div>

        {/* 3. Detection Incident History Table & Log Export */}
        <DetectionHistory
          events={detectionEvents}
          onClearEvents={() => setDetectionEvents([])}
        />

        {/* 4. Footer System Specifications */}
        <footer className="border-t border-slate-800/80 pt-4 pb-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-500">
          <div className="flex items-center gap-4">
            <span>RADARSYSTEM // ESP32 HC-SR04 SG90</span>
            <span>·</span>
            <span>PATH: /radar/telemetry</span>
            <span>·</span>
            <span>COMMANDS: /radar/commands/*</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsFirmwareOpen(true)}
              className="hover:text-emerald-400 transition-colors"
            >
              Firmware (.ino)
            </button>
            <button
              onClick={() => setIsRulesOpen(true)}
              className="hover:text-emerald-400 transition-colors"
            >
              Security Rules
            </button>
          </div>
        </footer>
      </main>

      {/* Modals */}
      <FirmwareGuideModal
        isOpen={isFirmwareOpen}
        onClose={() => setIsFirmwareOpen(false)}
      />

      <FirebaseRulesModal
        isOpen={isRulesOpen}
        onClose={() => setIsRulesOpen(false)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onDemoBypassLogin={() => setIsDemoAdmin(true)}
      />
    </div>
  );
}
