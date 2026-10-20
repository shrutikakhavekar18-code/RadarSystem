import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  push,
  Unsubscribe,
} from 'firebase/database';
import { TelemetryData, ESPStatus, RadarControls, CommandAck, DetectionEvent, HardwareLinkState } from '../types/radar';

export const firebaseConfig = {
  apiKey: "AIzaSyCEkrLem54F82nkph3QMiZm5nbl_3bWljE",
  authDomain: "radarsystem-6452b.firebaseapp.com",
  databaseURL: "https://radarsystem-6452b-default-rtdb.firebaseio.com",
  projectId: "radarsystem-6452b",
  storageBucket: "radarsystem-6452b.firebasestorage.app",
  messagingSenderId: "583704281347",
  appId: "1:583704281347:web:6b44ca479cd289d601e936",
  measurementId: "G-TTMHBC2SYP"
};

// Initialize Firebase safely
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);

// Exact Realtime Database Paths
export const DB_PATHS = {
  TELEMETRY: 'radar/telemetry',
  COMMANDS_SCAN: 'radar/commands/scanEnabled',
  COMMANDS_THRESHOLD: 'radar/commands/thresholdCm',
  COMMANDS_LED_MODE: 'radar/commands/ledMode',
  STATUS: 'radar/status',
  CONTROLS: 'radar/controls',
  ACKNOWLEDGEMENTS: 'radar/acknowledgements',
  HISTORY: 'radar/history',
  CONNECTED_INFO: '.info/connected'
};

/**
 * Persistent onValue listener for .info/connected
 */
export function subscribeToRTDBConnection(callback: (isConnected: boolean) => void): Unsubscribe {
  const connectedRef = ref(database, DB_PATHS.CONNECTED_INFO);
  return onValue(connectedRef, (snap) => {
    callback(Boolean(snap.val()));
  }, (error) => {
    console.error('RTDB Connection error:', error);
    callback(false);
  });
}

/**
 * Persistent onValue listener on the minimal path: /radar/telemetry
 * Immediately parses distanceCm, servoAngle, objectDetected, thresholdCm, ledOn, ledMode, scanningEnabled, online, uptimeMs
 */
export function subscribeToTelemetry(
  callback: (data: TelemetryData | null, rawTimestamp: number) => void
): Unsubscribe {
  const telemetryRef = ref(database, DB_PATHS.TELEMETRY);

  let prevAngle: number | null = null;

  return onValue(
    telemetryRef,
    (snapshot) => {
      const now = Date.now();
      if (snapshot.exists()) {
        const val = snapshot.val();
        
        // Support primary keys with backward-compatible fallbacks
        const servoAngleRaw = typeof val.servoAngle === 'number' ? val.servoAngle : (typeof val.angle === 'number' ? val.angle : 90);
        const distanceCmRaw = typeof val.distanceCm === 'number' ? val.distanceCm : (typeof val.distance === 'number' ? val.distance : 0);
        const thresholdRaw = typeof val.thresholdCm === 'number' ? val.thresholdCm : (typeof val.threshold === 'number' ? val.threshold : 25);
        const ledOnRaw = typeof val.ledOn === 'boolean' ? val.ledOn : Boolean(val.led);
        const ledModeRaw = val.ledMode || (ledOnRaw ? 'ON' : 'AUTO');
        const scanningEnabledRaw = typeof val.scanningEnabled === 'boolean' ? val.scanningEnabled : (typeof val.scanning === 'boolean' ? val.scanning : true);
        const onlineRaw = typeof val.online === 'boolean' ? val.online : true;

        // Calculate sweep direction from consecutive angles
        let direction: 'cw' | 'ccw' = 'cw';
        if (val.direction === 'ccw' || val.direction === 'cw') {
          direction = val.direction;
        } else if (prevAngle !== null) {
          direction = servoAngleRaw >= prevAngle ? 'cw' : 'ccw';
        }
        prevAngle = servoAngleRaw;

        const data: TelemetryData = {
          servoAngle: Math.max(0, Math.min(180, Math.round(servoAngleRaw))),
          distanceCm: Number(Number(distanceCmRaw).toFixed(1)),
          objectDetected: Boolean(val.objectDetected),
          thresholdCm: Math.max(5, Math.min(100, Math.round(thresholdRaw))),
          ledOn: ledOnRaw,
          ledMode: ledModeRaw,
          scanningEnabled: scanningEnabledRaw,
          online: onlineRaw,
          uptimeMs: typeof val.uptimeMs === 'number' ? val.uptimeMs : undefined,
          timestamp: now,
          direction,
          // Compatibility aliases
          angle: Math.max(0, Math.min(180, Math.round(servoAngleRaw))),
          distance: Number(Number(distanceCmRaw).toFixed(1)),
          threshold: Math.max(5, Math.min(100, Math.round(thresholdRaw))),
          led: ledOnRaw,
          scanning: scanningEnabledRaw,
        };

        callback(data, now);
      } else {
        callback(null, now);
      }
    },
    (err) => {
      console.error('Firebase /radar/telemetry listener error:', err);
    }
  );
}

/**
 * Dispatch command to /radar/commands/* as requested
 */
export async function sendCommandScanEnabled(enabled: boolean): Promise<void> {
  const scanRef = ref(database, DB_PATHS.COMMANDS_SCAN);
  await set(scanRef, enabled);

  // Sync to /radar/controls for compatibility
  try {
    const controlsRef = ref(database, DB_PATHS.CONTROLS);
    await update(controlsRef, { scanning: enabled });
  } catch {
    // Ignore legacy sync failures
  }
}

export async function sendCommandThresholdCm(thresholdCm: number): Promise<void> {
  const threshRef = ref(database, DB_PATHS.COMMANDS_THRESHOLD);
  await set(threshRef, thresholdCm);

  try {
    const controlsRef = ref(database, DB_PATHS.CONTROLS);
    await update(controlsRef, { threshold: thresholdCm });
  } catch {
    // Ignore legacy sync failures
  }
}

export async function sendCommandLedMode(ledMode: 'AUTO' | 'ON' | 'OFF'): Promise<void> {
  const modeRef = ref(database, DB_PATHS.COMMANDS_LED_MODE);
  await set(modeRef, ledMode);

  try {
    const controlsRef = ref(database, DB_PATHS.CONTROLS);
    await update(controlsRef, { 
      led: ledMode === 'ON',
      ledMode
    });
  } catch {
    // Ignore legacy sync failures
  }
}

/**
 * Combined command updater supporting batch updates and latency tracking
 */
export async function sendRadarControlUpdate(
  updates: Partial<RadarControls>
): Promise<{ commandId: string; sentAt: number }> {
  const commandId = 'cmd_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const sentAt = Date.now();

  const promises: Promise<unknown>[] = [];

  if (typeof updates.scanning === 'boolean') {
    promises.push(sendCommandScanEnabled(updates.scanning));
  }
  if (typeof updates.threshold === 'number') {
    promises.push(sendCommandThresholdCm(updates.threshold));
  }
  if (updates.ledMode) {
    promises.push(sendCommandLedMode(updates.ledMode));
  }

  // Update controls object with command ID
  const controlsRef = ref(database, DB_PATHS.CONTROLS);
  promises.push(
    update(controlsRef, {
      ...updates,
      lastCommandId: commandId,
      lastCommandTime: sentAt,
    })
  );

  await Promise.all(promises);

  return { commandId, sentAt };
}

/**
 * Record a detected obstacle event to history in RTDB
 */
export async function recordDetectionEvent(event: Omit<DetectionEvent, 'id'>) {
  try {
    const historyRef = ref(database, DB_PATHS.HISTORY);
    const newEntryRef = push(historyRef);
    await set(newEntryRef, {
      ...event,
      timestamp: Date.now()
    });
  } catch (err) {
    console.warn('Could not record detection to RTDB history:', err);
  }
}
