import React, { useState } from 'react';
import { X, Copy, Check, Terminal, Cpu, Zap, AlertCircle } from 'lucide-react';

interface FirmwareGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirmwareGuideModal: React.FC<FirmwareGuideModalProps> = ({ isOpen, onClose }) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'firmware' | 'wiring' | 'libraries'>('firmware');

  if (!isOpen) return null;

  const esp32InoCode = `/*
  ====================================================================
  RadarSystem ESP32 Firmware - Realtime Database Telemetry & Control
  ====================================================================
  Target Board: ESP32 Dev Module (WROOM-32)
  Libraries Required:
    1. Firebase ESP Client by Mobizt (v4.4.14+)
    2. ESP32Servo by Kevin Harrington
  ====================================================================
*/

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <ESP32Servo.h>

// Provide the token generation process info.
#include <addons/TokenHelper.h>
// Provide the RTDB payload printing info and other helper functions.
#include <addons/RTDBHelper.h>

// 1. WiFi Credentials
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// 2. Firebase Project Credentials (from your config)
#define API_KEY "AIzaSyCEkrLem54F82nkph3QMiZm5nbl_3bWljE"
#define DATABASE_URL "https://radarsystem-6452b-default-rtdb.firebaseio.com"

// 3. Hardware Pin Assignments
#define TRIG_PIN 5       // HC-SR04 Ultrasonic Trigger
#define ECHO_PIN 18      // HC-SR04 Ultrasonic Echo (Use voltage divider!)
#define SERVO_PIN 13     // SG90 Servo PWM signal
#define LED_PIN 2        // Built-in or external alert LED

// Objects
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
Servo radarServo;

// Radar State
int currentAngle = 90;
int sweepDirection = 1; // 1 = CW (0->180), -1 = CCW (180->0)
bool isScanning = true;
bool ledState = false;
int thresholdCm = 25;
int scanSpeedMs = 30;
bool manualMode = false;
int manualSteerAngle = 90;

unsigned long lastTelemetryTime = 0;
unsigned long lastHeartbeatTime = 0;
unsigned long lastControlPoll = 0;
String lastProcessedCmdId = "";

// Helper to measure distance in CM via HC-SR04
float measureDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 26000); // 26ms timeout (~440cm)
  if (duration == 0) return 999.0; // Out of range

  float distance = (duration * 0.0343) / 2.0;
  return distance;
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Initialize Servo
  radarServo.setPeriodHertz(50);
  radarServo.attach(SERVO_PIN, 500, 2400);
  radarServo.write(currentAngle);

  // Connect to Wi-Fi
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN)); // Blink while connecting
  }
  Serial.println("\\nWiFi Connected! IP Address: ");
  Serial.println(WiFi.localIP());
  digitalWrite(LED_PIN, LOW);

  // Configure Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  // Sign in anonymously or with user credentials
  config.signer.test_mode = true;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  // Initial Status broadcast
  updateHeartbeat();
}

void updateHeartbeat() {
  FirebaseJson statusJson;
  statusJson.set("online", true);
  statusJson.set("lastHeartbeat", (double)millis());
  statusJson.set("ip", WiFi.localIP().toString());
  statusJson.set("firmwareVersion", "1.2.0");
  statusJson.set("rssi", WiFi.RSSI());
  statusJson.set("freeHeap", ESP.getFreeHeap());
  Firebase.RTDB.setJSON(&fbdo, "/radar/status", &statusJson);
}

void fetchRemoteControls() {
  // Read scanEnabled command
  if (Firebase.RTDB.getBool(&fbdo, "/radar/commands/scanEnabled")) {
    isScanning = fbdo.boolData();
  }
  // Read threshold command
  if (Firebase.RTDB.getInt(&fbdo, "/radar/commands/thresholdCm")) {
    thresholdCm = fbdo.intData();
  }
  // Read ledMode command (AUTO, ON, OFF)
  if (Firebase.RTDB.getString(&fbdo, "/radar/commands/ledMode")) {
    String mode = fbdo.stringData();
    if (mode == "ON") {
      ledState = true;
    } else if (mode == "OFF") {
      ledState = false;
    }
  }

  // Also read /radar/controls for compatibility
  if (Firebase.RTDB.getJSON(&fbdo, "/radar/controls")) {
    FirebaseJson &json = fbdo.jsonObject();
    FirebaseJsonData jsonData;
    if (json.get(jsonData, "manualMode")) manualMode = jsonData.boolValue;
    if (json.get(jsonData, "manualSteerAngle")) manualSteerAngle = jsonData.intValue;
    if (json.get(jsonData, "scanSpeedMs")) scanSpeedMs = jsonData.intValue;
  }
}

void loop() {
  unsigned long now = millis();

  // 1. Periodic Heartbeat & Status
  if (now - lastHeartbeatTime > 4000) {
    lastHeartbeatTime = now;
    updateHeartbeat();
  }

  // 2. Poll remote commands every 350ms
  if (now - lastControlPoll > 350) {
    lastControlPoll = now;
    fetchRemoteControls();
  }

  // 3. Servo positioning and sensor sweep
  if (manualMode) {
    currentAngle = constrain(manualSteerAngle, 0, 180);
    radarServo.write(currentAngle);
  } else if (isScanning) {
    currentAngle += sweepDirection * 2; // 2 degree steps
    if (currentAngle >= 180) {
      currentAngle = 180;
      sweepDirection = -1;
    } else if (currentAngle <= 0) {
      currentAngle = 0;
      sweepDirection = 1;
    }
    radarServo.write(currentAngle);
  }

  // 4. Ultrasonic measurement
  float distance = measureDistanceCm();
  bool objectDetected = (distance > 0 && distance <= thresholdCm && distance < 400.0);

  // Turn on LED automatically if object detected or forced ON
  bool activeLed = objectDetected || ledState;
  digitalWrite(LED_PIN, activeLed ? HIGH : LOW);

  // 5. Publish Telemetry to /radar/telemetry
  if (now - lastTelemetryTime > scanSpeedMs) {
    lastTelemetryTime = now;

    FirebaseJson teleJson;
    teleJson.set("servoAngle", currentAngle);
    teleJson.set("distanceCm", distance);
    teleJson.set("objectDetected", objectDetected);
    teleJson.set("thresholdCm", thresholdCm);
    teleJson.set("ledOn", activeLed);
    teleJson.set("ledMode", ledState ? "ON" : "AUTO");
    teleJson.set("scanningEnabled", isScanning);
    teleJson.set("online", true);
    teleJson.set("uptimeMs", (double)now);
    teleJson.set("direction", sweepDirection == 1 ? "cw" : "ccw");

    // Also include legacy field aliases for maximum compatibility
    teleJson.set("angle", currentAngle);
    teleJson.set("distance", distance);
    teleJson.set("scanning", isScanning);
    teleJson.set("led", activeLed);

    Firebase.RTDB.setJSON(&fbdo, "/radar/telemetry", &teleJson);
  }

  delay(scanSpeedMs);
}
`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(esp32InoCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#090d15] border border-slate-800 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0c140f]">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-slate-100 font-mono">
              ESP32 Firmware & Hardware Integration Guide
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subnav Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-800 text-xs font-mono">
          <button
            onClick={() => setActiveTab('firmware')}
            className={`px-3 py-2 border-b-2 font-semibold transition-colors ${
              activeTab === 'firmware'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ESP32 Arduino (.ino) Code
          </button>
          <button
            onClick={() => setActiveTab('wiring')}
            className={`px-3 py-2 border-b-2 font-semibold transition-colors ${
              activeTab === 'wiring'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Hardware Wiring & Pinout
          </button>
          <button
            onClick={() => setActiveTab('libraries')}
            className={`px-3 py-2 border-b-2 font-semibold transition-colors ${
              activeTab === 'libraries'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Arduino IDE Setup Checklist
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 font-mono text-xs">
          {activeTab === 'firmware' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">
                  Ready-to-flash Arduino sketch. Remember to edit your Wi-Fi SSID and Password!
                </span>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 rounded transition-colors"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied to Clipboard' : 'Copy Full Sketch'}</span>
                </button>
              </div>
              <pre className="p-4 bg-[#05070c] border border-slate-800/80 rounded-lg overflow-x-auto text-[11px] text-slate-300 leading-relaxed max-h-[500px]">
                {esp32InoCode}
              </pre>
            </div>
          )}

          {activeTab === 'wiring' && (
            <div className="flex flex-col gap-5 text-slate-300">
              <div className="bg-amber-950/20 border border-amber-800/40 p-3 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-semibold text-amber-300">Crucial HC-SR04 Voltage Note: </span>
                  The HC-SR04 ultrasonic sensor requires 5V VCC to emit ultrasound properly. However, ESP32 GPIOs operate at 3.3V logic. Use a simple voltage divider (1kΩ and 2kΩ resistors) on the ECHO pin to drop 5V to ~3.3V before connecting to GPIO 18, protecting the ESP32!
                </div>
              </div>

              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0c140f] text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Component</th>
                      <th className="py-2.5 px-4 font-semibold">Sensor Pin</th>
                      <th className="py-2.5 px-4 font-semibold">ESP32 Pin</th>
                      <th className="py-2.5 px-4 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <tr>
                      <td className="py-2 px-4 font-semibold text-emerald-400">HC-SR04 Ultrasonic</td>
                      <td className="py-2 px-4">VCC</td>
                      <td className="py-2 px-4">VIN / 5V</td>
                      <td className="py-2 px-4 text-slate-400">Power from USB 5V or external 5V</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-semibold text-emerald-400">HC-SR04 Ultrasonic</td>
                      <td className="py-2 px-4">GND</td>
                      <td className="py-2 px-4">GND</td>
                      <td className="py-2 px-4 text-slate-400">Common ground</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-semibold text-emerald-400">HC-SR04 Ultrasonic</td>
                      <td className="py-2 px-4">TRIG</td>
                      <td className="py-2 px-4 text-amber-300 font-bold">GPIO 5</td>
                      <td className="py-2 px-4 text-slate-400">Trigger pulse output</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-semibold text-emerald-400">HC-SR04 Ultrasonic</td>
                      <td className="py-2 px-4">ECHO</td>
                      <td className="py-2 px-4 text-amber-300 font-bold">GPIO 18</td>
                      <td className="py-2 px-4 text-slate-400">Via 1kΩ / 2kΩ divider to 3.3V</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-semibold text-emerald-400">SG90 Micro Servo</td>
                      <td className="py-2 px-4">PWM (Orange/Yellow)</td>
                      <td className="py-2 px-4 text-amber-300 font-bold">GPIO 13</td>
                      <td className="py-2 px-4 text-slate-400">Servo control signal</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-semibold text-emerald-400">SG90 Micro Servo</td>
                      <td className="py-2 px-4">VCC (Red)</td>
                      <td className="py-2 px-4">5V / VIN</td>
                      <td className="py-2 px-4 text-slate-400">External power recommended if servo jitters</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-semibold text-emerald-400">SG90 Micro Servo</td>
                      <td className="py-2 px-4">GND (Brown/Black)</td>
                      <td className="py-2 px-4">GND</td>
                      <td className="py-2 px-4 text-slate-400">Common ground with ESP32</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-semibold text-emerald-400">Alert LED Indicator</td>
                      <td className="py-2 px-4">Anode (+)</td>
                      <td className="py-2 px-4 text-amber-300 font-bold">GPIO 2</td>
                      <td className="py-2 px-4 text-slate-400">Via 220Ω resistor or onboard LED</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-semibold text-emerald-400">Alert LED Indicator</td>
                      <td className="py-2 px-4">Cathode (-)</td>
                      <td className="py-2 px-4">GND</td>
                      <td className="py-2 px-4 text-slate-400">Ground</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'libraries' && (
            <div className="flex flex-col gap-4 text-slate-300">
              <h3 className="text-sm font-bold text-slate-100">Step-by-step Setup Checklist:</h3>
              <ol className="list-decimal pl-5 space-y-3 leading-relaxed">
                <li>
                  <strong className="text-emerald-400">Install ESP32 Board in Arduino IDE:</strong>
                  <div className="text-slate-400 mt-1">
                    Go to <code className="bg-slate-900 px-1 py-0.5 rounded">File &gt; Preferences</code>, add <code className="text-emerald-300 bg-slate-900 px-1 rounded">https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json</code> to Additional Board Managers URLs. Then in <code className="bg-slate-900 px-1 py-0.5 rounded">Tools &gt; Board &gt; Boards Manager</code>, install <strong>esp32 by Espressif Systems</strong>.
                  </div>
                </li>
                <li>
                  <strong className="text-emerald-400">Install Required Arduino Libraries:</strong>
                  <div className="text-slate-400 mt-1">
                    Open <code className="bg-slate-900 px-1 py-0.5 rounded">Tools &gt; Manage Libraries...</code> and install:
                    <ul className="list-disc pl-5 mt-1 space-y-1">
                      <li><strong>Firebase ESP Client</strong> by Mobizt</li>
                      <li><strong>ESP32Servo</strong> by Kevin Harrington</li>
                    </ul>
                  </div>
                </li>
                <li>
                  <strong className="text-emerald-400">Select Board & Port:</strong>
                  <div className="text-slate-400 mt-1">
                    Select <code className="bg-slate-900 px-1 py-0.5 rounded">Tools &gt; Board &gt; ESP32 Arduino &gt; ESP32 Dev Module</code>. Set Upload Speed to 921600 or 115200 and select your COM/TTY port.
                  </div>
                </li>
                <li>
                  <strong className="text-emerald-400">Update Wi-Fi & Flash:</strong>
                  <div className="text-slate-400 mt-1">
                    Paste the sketch code from the first tab, change <code className="text-emerald-300">WIFI_SSID</code> and <code className="text-emerald-300">WIFI_PASSWORD</code>, click <strong>Upload</strong>. Open the Serial Monitor at 115200 baud to verify connection!
                  </div>
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-[#0c140f] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
