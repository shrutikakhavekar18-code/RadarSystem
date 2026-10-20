import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TelemetryData, HardwareLinkState } from '../types/radar';
import { Trash2, Radio, Compass, AlertCircle, Eye, EyeOff } from 'lucide-react';

export interface PlottedDetection {
  id: string;
  angle: number;
  distance: number;
  x: number;
  y: number;
  timestamp: number;
  isLatest: boolean;
  severity: 'critical' | 'warning';
}

interface RadarCanvasProps {
  telemetry: TelemetryData;
  threshold: number;
  maxRangeCm?: number;
  isScanning: boolean;
  linkState: HardwareLinkState;
  lastUpdateEpoch: number;
  manualMode: boolean;
  onManualAngleSelect?: (angle: number) => void;
  detectionPoints: PlottedDetection[];
  onClearDetections: () => void;
}

export const RadarCanvas: React.FC<RadarCanvasProps> = ({
  telemetry,
  threshold,
  maxRangeCm = 50,
  isScanning,
  linkState,
  lastUpdateEpoch,
  manualMode,
  onManualAngleSelect,
  detectionPoints,
  onClearDetections,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 60 FPS Visual Sweep State (Independent of network/Firebase updates)
  const animAngleRef = useRef<number>(telemetry.servoAngle || 90);
  const animDirectionRef = useRef<number>(1); // 1 = towards 180, -1 = towards 0
  const lastFrameTimeRef = useRef<number>(performance.now());
  const reportedAngleRef = useRef<number>(telemetry.servoAngle || 90);
  const isScanningRef = useRef<boolean>(isScanning);

  // Toggle overlay for real hardware heading pointer
  const [showHardwareHeading, setShowHardwareHeading] = useState<boolean>(true);
  const [hoverCoord, setHoverCoord] = useState<{ angle: number; distance: number; x: number; y: number } | null>(null);

  // Keep refs in sync with incoming props
  useEffect(() => {
    isScanningRef.current = isScanning;
  }, [isScanning]);

  useEffect(() => {
    reportedAngleRef.current = telemetry.servoAngle;
    // Synchronize sweep direction if hardware reports it
    if (telemetry.direction === 'cw') {
      animDirectionRef.current = 1;
    } else if (telemetry.direction === 'ccw') {
      animDirectionRef.current = -1;
    }
  }, [telemetry.servoAngle, telemetry.direction]);

  // Main 60 FPS requestAnimationFrame animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const renderFrame = (nowTime: number) => {
      const dt = Math.min(100, nowTime - lastFrameTimeRef.current);
      lastFrameTimeRef.current = nowTime;

      // Advance visual sweep smoothly at ~45-60 deg/sec if scanning is active
      if (isScanningRef.current && !manualMode) {
        const sweepSpeedDegPerSec = 55; // Natural smooth radar rotation
        const deltaAngle = (sweepSpeedDegPerSec * dt) / 1000;
        animAngleRef.current += animDirectionRef.current * deltaAngle;

        if (animAngleRef.current >= 180) {
          animAngleRef.current = 180;
          animDirectionRef.current = -1;
        } else if (animAngleRef.current <= 0) {
          animAngleRef.current = 0;
          animDirectionRef.current = 1;
        }
      } else if (manualMode) {
        // In manual mode, visual sweep aligns with commanded angle
        animAngleRef.current = reportedAngleRef.current;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width;
      const height = canvas.height;

      // Coordinate center: at bottom center
      const centerX = width / 2;
      const centerY = height - 42 * dpr;
      const radius = Math.min(centerX - 48 * dpr, centerY - 28 * dpr);

      // 1. Dark CRT Scope Background
      ctx.fillStyle = '#030708';
      ctx.fillRect(0, 0, width, height);

      // Radar Screen Semicircle Backplate
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, Math.PI, 0, false);
      ctx.closePath();
      const scopeGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      scopeGrad.addColorStop(0, '#04130c');
      scopeGrad.addColorStop(0.7, '#020b07');
      scopeGrad.addColorStop(1, '#010503');
      ctx.fillStyle = scopeGrad;
      ctx.fill();

      // Subtle CRT phosphorescent scanlines pattern
      ctx.strokeStyle = 'rgba(0, 255, 102, 0.02)';
      ctx.lineWidth = 1 * dpr;
      for (let y = centerY - radius; y <= centerY; y += 4 * dpr) {
        ctx.beginPath();
        ctx.moveTo(centerX - radius, y);
        ctx.lineTo(centerX + radius, y);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Tactical Green Radar Grid & Range Rings
      const ringSteps = [0.2, 0.4, 0.6, 0.8, 1.0];
      ringSteps.forEach((step) => {
        const r = radius * step;
        const distVal = Math.round(maxRangeCm * step);

        ctx.beginPath();
        ctx.arc(centerX, centerY, r, Math.PI, 0, false);
        ctx.strokeStyle = step === 1.0 ? 'rgba(0, 255, 102, 0.5)' : 'rgba(0, 255, 102, 0.2)';
        ctx.lineWidth = (step === 1.0 ? 1.5 : 1) * dpr;
        ctx.setLineDash(step === 1.0 ? [] : [3 * dpr, 4 * dpr]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Range ring distance label (at 90 deg top)
        ctx.fillStyle = 'rgba(0, 255, 102, 0.75)';
        ctx.font = `${9 * dpr}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${distVal}cm`, centerX, centerY - r - 3 * dpr);
      });

      // 3. Proximity Detection Threshold Arc
      if (threshold > 0 && threshold <= maxRangeCm) {
        const threshR = radius * (threshold / maxRangeCm);
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, threshR, Math.PI, 0, false);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Threshold indicator label
        ctx.fillStyle = '#f59e0b';
        ctx.font = `${8.5 * dpr}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(`LIMIT: ${threshold}cm`, centerX + 10 * dpr, centerY - threshR - 3 * dpr);
        ctx.restore();
      }

      // 4. Radial Angle Spoke Markings (0°, 30°, 45°, 60°, 90°, 120°, 135°, 150°, 180°)
      const angles = [0, 30, 45, 60, 90, 120, 135, 150, 180];
      angles.forEach((deg) => {
        // 0° on Right (0 rad), 90° Top (PI/2), 180° Left (PI)
        const rad = deg * (Math.PI / 180);
        const x = centerX + Math.cos(rad) * radius;
        const y = centerY - Math.sin(rad) * radius;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = deg === 90 ? 'rgba(0, 255, 102, 0.45)' : 'rgba(0, 255, 102, 0.18)';
        ctx.lineWidth = (deg === 90 || deg === 0 || deg === 180 ? 1.5 : 1) * dpr;
        ctx.stroke();

        // Outer angle text label
        const labelX = centerX + Math.cos(rad) * (radius + 22 * dpr);
        const labelY = centerY - Math.sin(rad) * (radius + 18 * dpr);

        ctx.fillStyle = deg === 90 ? '#00ff66' : 'rgba(0, 255, 102, 0.65)';
        ctx.font = `${9.5 * dpr}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${deg}°`, labelX, labelY);
      });

      // Bezel Minor Degree Ticks along the outer rim
      for (let d = 0; d <= 180; d += 5) {
        const rad = d * (Math.PI / 180);
        const isMajor = d % 15 === 0;
        const tickLength = (isMajor ? 8 : 4) * dpr;
        const x1 = centerX + Math.cos(rad) * radius;
        const y1 = centerY - Math.sin(rad) * radius;
        const x2 = centerX + Math.cos(rad) * (radius + tickLength);
        const y2 = centerY - Math.sin(rad) * (radius + tickLength);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = isMajor ? 'rgba(0, 255, 102, 0.5)' : 'rgba(0, 255, 102, 0.2)';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
      }

      // Outer bounding rim
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, Math.PI, 0, false);
      ctx.strokeStyle = '#00ff66';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();

      // Bottom baseline
      ctx.beginPath();
      ctx.moveTo(centerX - radius - 15 * dpr, centerY);
      ctx.lineTo(centerX + radius + 15 * dpr, centerY);
      ctx.strokeStyle = 'rgba(0, 255, 102, 0.4)';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();

      // 5. Plotted Detection Points with Fading Phosphor Persistence
      const nowTs = Date.now();
      const MAX_AGE_MS = 9000;

      detectionPoints.forEach((pt) => {
        const age = nowTs - pt.timestamp;
        if (age > MAX_AGE_MS) return;

        const alpha = Math.max(0.15, 1 - age / MAX_AGE_MS);
        const ptRad = pt.angle * (Math.PI / 180);
        const ptR = (Math.min(pt.distance, maxRangeCm) / maxRangeCm) * radius;
        const px = centerX + Math.cos(ptRad) * ptR;
        const py = centerY - Math.sin(ptRad) * ptR;

        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, (pt.isLatest ? 5.5 : 4) * dpr, 0, Math.PI * 2);

        if (pt.isLatest) {
          // Bright glowing red/amber target blip
          ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 12 * dpr;
          ctx.fill();

          // Expanding pulse wave on latest detection
          const wavePhase = (nowTs % 1000) / 1000;
          ctx.beginPath();
          ctx.arc(px, py, (6 + wavePhase * 16) * dpr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239, 68, 68, ${Math.max(0, 1 - wavePhase)})`;
          ctx.lineWidth = 1.5 * dpr;
          ctx.stroke();

          // Target distance callout label
          ctx.fillStyle = '#fca5a5';
          ctx.font = `${8 * dpr}px 'JetBrains Mono', monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(`${pt.distance.toFixed(1)}cm`, px, py - 8 * dpr);
        } else {
          // Amber/Red fading persistent point
          ctx.fillStyle = pt.severity === 'critical'
            ? `rgba(239, 68, 68, ${alpha * 0.85})`
            : `rgba(245, 158, 11, ${alpha * 0.75})`;
          ctx.shadowColor = pt.severity === 'critical' ? '#ef4444' : '#f59e0b';
          ctx.shadowBlur = 6 * dpr;
          ctx.fill();
        }
        ctx.restore();
      });

      // 6. Smooth Green Radar Sweep Line & Phosphor Trail Fan (60 FPS)
      const sweepAngle = animAngleRef.current;
      const sweepRad = sweepAngle * (Math.PI / 180);

      // Trailing Phosphor Fan Arc (22 degrees behind current heading)
      const fanSpan = 22 * (Math.PI / 180);
      const isMovingTowards180 = animDirectionRef.current === 1;
      const fanStartRad = isMovingTowards180 ? sweepRad - fanSpan : sweepRad + fanSpan;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(
        centerX,
        centerY,
        radius,
        Math.min(sweepRad, fanStartRad),
        Math.max(sweepRad, fanStartRad),
        false
      );
      ctx.closePath();

      // Phosphor gradient fill
      const fanGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      fanGrad.addColorStop(0, 'rgba(0, 255, 102, 0.45)');
      fanGrad.addColorStop(0.65, 'rgba(0, 255, 102, 0.18)');
      fanGrad.addColorStop(1, 'rgba(0, 255, 102, 0.0)');
      ctx.fillStyle = fanGrad;
      ctx.fill();
      ctx.restore();

      // Crisp Leading Green Sweep Line
      const beamX = centerX + Math.cos(sweepRad) * radius;
      const beamY = centerY - Math.sin(sweepRad) * radius;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(beamX, beamY);
      ctx.strokeStyle = '#00ff66';
      ctx.lineWidth = 2 * dpr;
      ctx.shadowColor = '#00ff66';
      ctx.shadowBlur = 10 * dpr;
      ctx.stroke();

      // Luminous tip at beam end
      ctx.beginPath();
      ctx.arc(beamX, beamY, 3 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00ff66';
      ctx.shadowBlur = 12 * dpr;
      ctx.fill();
      ctx.restore();

      // 7. Dedicated Actual Hardware Servo Angle Needle (Clearly distinguished)
      if (showHardwareHeading) {
        const hwAngle = reportedAngleRef.current;
        const hwRad = hwAngle * (Math.PI / 180);
        const hwX = centerX + Math.cos(hwRad) * (radius - 12 * dpr);
        const hwY = centerY - Math.sin(hwRad) * (radius - 12 * dpr);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(hwX, hwY);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)'; // Laser Cyan distinct from green sweep
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Hardware heading reticle mark
        ctx.beginPath();
        ctx.arc(hwX, hwY, 4 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.shadowColor = '#0284c7';
        ctx.shadowBlur = 8 * dpr;
        ctx.fill();

        // If distance reading is valid, plot current real-time distance point on hardware needle
        if (telemetry.distanceCm > 0 && telemetry.distanceCm <= maxRangeCm) {
          const curR = (telemetry.distanceCm / maxRangeCm) * radius;
          const curX = centerX + Math.cos(hwRad) * curR;
          const curY = centerY - Math.sin(hwRad) * curR;

          ctx.beginPath();
          ctx.arc(curX, curY, 5 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = telemetry.objectDetected ? '#ef4444' : '#10b981';
          ctx.shadowColor = telemetry.objectDetected ? '#ef4444' : '#10b981';
          ctx.shadowBlur = 10 * dpr;
          ctx.fill();
        }

        ctx.restore();
      }

      // 8. Servo Pivot Center Hub
      ctx.beginPath();
      ctx.arc(centerX, centerY, 9 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#064e3b';
      ctx.fill();
      ctx.strokeStyle = '#00ff66';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, 3.5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [maxRangeCm, threshold, manualMode, showHardwareHeading, detectionPoints, telemetry]);

  // Canvas dynamic resize handling using requestAnimationFrame to prevent ResizeObserver loop limit errors
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let rafId: number | null = null;

    const updateDimensions = (width: number, height: number) => {
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(1, Math.floor(width * dpr));
      const targetH = Math.max(1, Math.floor(height * dpr));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    // Initial size setup
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      updateDimensions(rect.width, rect.height);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            updateDimensions(width, height);
          }
        }
      });
    });

    resizeObserver.observe(container);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
    };
  }, []);

  // Mouse move interactive coordinate inspector
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height - 42;
    const radius = Math.min(centerX - 48, centerY - 28);

    const dx = clientX - centerX;
    const dy = centerY - clientY;

    if (dy < -6) {
      setHoverCoord(null);
      return;
    }

    const mouseDistPx = Math.sqrt(dx * dx + dy * dy);
    if (mouseDistPx > radius + 20) {
      setHoverCoord(null);
      return;
    }

    // 0 on right, 90 on top, 180 on left
    let rad = Math.atan2(dy, dx);
    if (rad < 0) rad = 0;
    const angleDeg = Math.round(rad * (180 / Math.PI));
    const distanceCm = Math.min(maxRangeCm, Math.round((mouseDistPx / radius) * maxRangeCm));

    setHoverCoord({
      angle: Math.max(0, Math.min(180, angleDeg)),
      distance: distanceCm,
      x: Math.round((dx / radius) * maxRangeCm),
      y: Math.round((dy / radius) * maxRangeCm),
    });
  }, [maxRangeCm]);

  const handleMouseLeave = () => {
    setHoverCoord(null);
  };

  const handleClick = () => {
    if (hoverCoord && onManualAngleSelect && manualMode) {
      onManualAngleSelect(hoverCoord.angle);
    }
  };

  const lastUpdateSecAgo = Math.max(0, Math.round((Date.now() - lastUpdateEpoch) / 1000));

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-4 select-none bg-[#030708]">
      {/* Top HUD Header */}
      <div className="flex items-center justify-between gap-4 z-10 text-xs font-mono border-b border-emerald-950/80 pb-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[#00ff66] font-semibold">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>180° AZIMUTH RADAR</span>
          </div>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400">0–{maxRangeCm}cm RANGE</span>
          <span className="text-slate-600">·</span>
          {/* Link state badge */}
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
            linkState === 'LIVE'
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/60'
              : linkState === 'STALE'
              ? 'bg-amber-950 text-amber-300 border border-amber-600/60'
              : 'bg-rose-950 text-rose-300 border border-rose-600/60'
          }`}>
            {linkState} ({lastUpdateSecAgo}s ago)
          </span>
        </div>

        {/* Action Controls & Toggles */}
        <div className="flex items-center gap-2">
          {/* Toggle Hardware Heading Indicator */}
          <button
            onClick={() => setShowHardwareHeading(!showHardwareHeading)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] transition-colors ${
              showHardwareHeading
                ? 'bg-sky-950/80 text-sky-300 border-sky-600/50'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title="Toggle cyan hardware servo pointer overlay"
          >
            {showHardwareHeading ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span className="hidden sm:inline">Hardware Heading</span>
          </button>

          {/* Clear Detection Points Button */}
          <button
            onClick={onClearDetections}
            disabled={detectionPoints.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-rose-300 rounded text-[11px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Clear all plotted detection points from radar display"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear Points ({detectionPoints.length})</span>
          </button>
        </div>
      </div>

      {/* Crosshair telemetry popup on hover */}
      {hoverCoord && (
        <div className="absolute top-14 right-4 z-20 bg-black/90 border border-emerald-500/40 px-3 py-1.5 rounded text-xs font-mono tabular-nums shadow-xl text-right">
          <span className="text-[#00ff66] font-bold">{hoverCoord.angle}° AZIMUTH</span>
          <span className="mx-1.5 text-slate-600">/</span>
          <span className="text-amber-400 font-bold">{hoverCoord.distance} cm</span>
          <div className="text-[10px] text-slate-400 mt-0.5">
            COORD: X={hoverCoord.x}cm, Y={hoverCoord.y}cm
          </div>
          {manualMode && (
            <div className="text-[10px] text-sky-400 mt-0.5">Click to command servo angle</div>
          )}
        </div>
      )}

      {/* Main Canvas Viewport */}
      <div ref={containerRef} className="relative w-full flex-1 min-h-[360px] max-h-[520px] my-2">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          className={`w-full h-full rounded-md transition-colors ${
            manualMode ? 'cursor-crosshair' : 'cursor-default'
          }`}
        />
      </div>

      {/* Bottom Telemetry Legend & Verification Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-emerald-950/80 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-0.5 bg-[#00ff66] inline-block shadow-[0_0_6px_#00ff66]"></span>
            Visual Sweep: 60 FPS Continuous
          </span>
          <span className="flex items-center gap-1.5 text-sky-400">
            <span className="w-2.5 h-0.5 bg-sky-400 inline-block border-b border-dashed border-sky-300"></span>
            Reported Hardware Angle: {telemetry.servoAngle}°
          </span>
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block shadow-[0_0_6px_#ef4444]"></span>
            Active Contact (&le;{threshold}cm)
          </span>
        </div>

        <div className="text-slate-500">
          <span>COORDINATES: POLAR 0°(R) → 90°(T) → 180°(L)</span>
        </div>
      </div>
    </div>
  );
};
