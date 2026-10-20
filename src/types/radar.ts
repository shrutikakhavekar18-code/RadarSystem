export interface TelemetryData {
  servoAngle: number;       // Current reported servo angle: 0 to 180 degrees
  distanceCm: number;       // Measured distance in cm
  objectDetected: boolean;  // True if an obstacle is within threshold
  thresholdCm: number;      // Proximity limit in cm
  ledOn: boolean;           // Real-time LED actuator state
  ledMode: 'AUTO' | 'ON' | 'OFF' | string; // LED mode setting
  scanningEnabled: boolean; // Whether the ESP32 is actively sweeping
  online: boolean;          // Raw flag reported by hardware
  uptimeMs?: number;        // ESP32 millis() uptime
  timestamp: number;        // Local arrival epoch timestamp
  direction?: 'cw' | 'ccw'; // Derived or reported sweep direction
  
  // Backward-compatibility aliases
  angle?: number;
  distance?: number;
  threshold?: number;
  led?: boolean;
  scanning?: boolean;
}

export type HardwareLinkState = 'LIVE' | 'STALE' | 'OFFLINE';

export interface ESPStatus {
  online: boolean;
  lastHeartbeat: number;
  linkState: HardwareLinkState;
  ip?: string;
  firmwareVersion?: string;
  rssi?: number;
  freeHeap?: number;
  uptimeSeconds?: number;
  lastUpdateEpoch?: number;
}

export interface RadarControls {
  scanning: boolean;       // Master sweep active (/radar/commands/scanEnabled)
  ledMode: 'AUTO' | 'ON' | 'OFF'; // LED mode (/radar/commands/ledMode)
  threshold: number;       // Distance trigger in cm (/radar/commands/thresholdCm)
  scanSpeedMs: number;     // Sweep delay per degree in ms
  minAngle: number;
  maxAngle: number;
  manualMode: boolean;
  manualSteerAngle: number;
  lastCommandId?: string;
  lastCommandTime?: number;
  led?: boolean;           // Compatibility alias
}

export interface CommandAck {
  lastProcessedCommandId: string;
  status: 'SUCCESS' | 'ERROR' | 'PENDING';
  message?: string;
  timestamp: number;
}

export interface DetectionEvent {
  id: string;
  timestamp: number;
  angle: number;
  distance: number;
  threshold: number;
  severity: 'critical' | 'warning' | 'normal'; // critical: <= 15cm, warning: <= threshold
}

export interface RadarPoint {
  x: number;
  y: number;
  angle: number;
  distance: number;
  timestamp: number;
  isLatest: boolean;
  severity: 'critical' | 'warning';
}
