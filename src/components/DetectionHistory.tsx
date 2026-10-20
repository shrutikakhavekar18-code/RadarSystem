import React, { useState } from 'react';
import { History, Download, Trash2, ShieldAlert, Check } from 'lucide-react';
import { DetectionEvent } from '../types/radar';

interface DetectionHistoryProps {
  events: DetectionEvent[];
  onClearEvents: () => void;
}

export const DetectionHistory: React.FC<DetectionHistoryProps> = ({
  events,
  onClearEvents,
}) => {
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [copied, setCopied] = useState(false);

  const filteredEvents = events.filter((ev) => {
    if (filter === 'all') return true;
    return ev.severity === filter;
  });

  const handleExportCSV = () => {
    if (events.length === 0) return;
    const headers = ['Timestamp', 'ISO_Time', 'Angle_Deg', 'Distance_CM', 'Threshold_CM', 'Severity'];
    const rows = events.map((ev) => [
      ev.timestamp,
      new Date(ev.timestamp).toISOString(),
      ev.angle,
      ev.distance,
      ev.threshold,
      ev.severity,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `radar_telemetry_log_${new Date().toISOString().substring(0, 19)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-[#080d0a] border border-slate-800 rounded-lg p-5 flex flex-col gap-4">
      {/* Table Header & Functional Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
            Detection Incident Log
          </h2>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            ({events.length} records)
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Segmented Filter Buttons */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                filter === 'all'
                  ? 'bg-slate-800 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('critical')}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                filter === 'critical'
                  ? 'bg-rose-950/70 text-rose-300 border border-rose-800/40 font-semibold'
                  : 'text-slate-400 hover:text-rose-300'
              }`}
            >
              &lt;15cm
            </button>
            <button
              onClick={() => setFilter('warning')}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                filter === 'warning'
                  ? 'bg-amber-950/70 text-amber-300 border border-amber-800/40 font-semibold'
                  : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              Warning
            </button>
          </div>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            disabled={events.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-slate-100 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export CSV data for college lab report"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          {/* Clear Log */}
          <button
            onClick={onClearEvents}
            disabled={events.length === 0}
            className="p-1.5 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-900 transition-colors disabled:opacity-30"
            title="Clear Log"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="py-10 text-center text-xs font-mono text-slate-500 flex flex-col items-center justify-center gap-2">
            <ShieldAlert className="w-6 h-6 text-slate-700" />
            <span>No obstacle breaches recorded in this session.</span>
            <span className="text-[11px] text-slate-600">
              When an object passes within threshold distance, telemetry logs appear here.
            </span>
          </div>
        ) : (
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0b0e17] text-slate-400 border-b border-slate-800 sticky top-0">
              <tr>
                <th className="py-2 px-3 font-semibold">TIME</th>
                <th className="py-2 px-3 font-semibold">HEADING</th>
                <th className="py-2 px-3 font-semibold">DISTANCE</th>
                <th className="py-2 px-3 font-semibold">SEVERITY</th>
                <th className="py-2 px-3 font-semibold text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredEvents.slice(0, 50).map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-2 px-3 text-slate-400 whitespace-nowrap tabular-nums">
                    {new Date(ev.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="py-2 px-3 text-emerald-400 tabular-nums">
                    {ev.angle}°
                  </td>
                  <td className="py-2 px-3 font-semibold tabular-nums">
                    <span className={ev.severity === 'critical' ? 'text-rose-400' : 'text-amber-300'}>
                      {ev.distance.toFixed(1)} cm
                    </span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {ev.severity === 'critical' ? (
                      <span className="text-rose-400 uppercase text-[11px] font-semibold">
                        CRITICAL (&le;15cm)
                      </span>
                    ) : (
                      <span className="text-amber-400 uppercase text-[11px]">
                        PROXIMITY ALERT
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-400 text-[11px]">
                    REGISTERED
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
