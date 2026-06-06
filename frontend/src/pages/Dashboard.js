import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import Layout from '../components/Layout';
import { useDashboard, today } from '../context/DashboardContext';

/* ── Capacity colour scale ──────────────────────────────────────────────── */
const heatColor = (pct) => {
  if (pct >= 90) return { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', dot: '#ef4444', label: 'Critical' };
  if (pct >= 70) return { bg: '#fff7ed', border: '#fdba74', text: '#c2410c', dot: '#f97316', label: 'High'     };
  if (pct >= 40) return { bg: '#fefce8', border: '#fde047', text: '#a16207', dot: '#eab308', label: 'Moderate' };
  if (pct >  0)  return { bg: '#f0fdf4', border: '#86efac', text: '#15803d', dot: '#22c55e', label: 'Low'      };
  return              { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280', dot: '#d1d5db', label: 'Empty'    };
};

/* ── Custom tooltips ────────────────────────────────────────────────────── */
const DonutTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white shadow-xl border border-gray-100 rounded-xl px-3 py-2 text-xs">
      <p className="font-bold text-gray-700">{payload[0].name}</p>
      <p className="text-gray-500 mt-0.5">{payload[0].value} beds</p>
    </div>
  );
};

const BarTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const occ = payload.find(p => p.dataKey === 'occupied')?.value ?? 0;
  const free = payload.find(p => p.dataKey === 'available')?.value ?? 0;
  const total = occ + free;
  const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
  return (
    <div className="bg-white shadow-xl border border-gray-100 rounded-xl px-3 py-2 text-xs">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      <div className="flex flex-col gap-0.5">
        <p><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />Occupied: <b>{occ}</b></p>
        <p><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1" />Free: <b>{free}</b></p>
        <p className="text-gray-500 mt-0.5">Utilisation: <b>{pct}%</b></p>
      </div>
    </div>
  );
};

/* ── KPI Card ───────────────────────────────────────────────────────────── */
const KpiCard = ({ label, value, sub, gradient, icon, onClick, badge }) => (
  <div
    onClick={onClick}
    className={`relative rounded-2xl p-4 flex items-center gap-3 transition-all overflow-hidden ${
      onClick ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5' : ''
    } ${gradient}`}
  >
    <div className="w-10 h-10 bg-white bg-opacity-25 rounded-xl flex items-center justify-center flex-shrink-0">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold text-white text-opacity-80 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-black text-white leading-none mt-0.5">{value ?? '—'}</p>
      {sub && <p className="text-xs text-white text-opacity-70 mt-0.5">{sub}</p>}
    </div>
    {badge && (
      <span className="absolute top-2 right-2 bg-white bg-opacity-25 text-white text-xs font-bold px-2 py-0.5 rounded-full">
        {badge}
      </span>
    )}
    {onClick && (
      <svg className="w-4 h-4 text-white text-opacity-60 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    )}
  </div>
);

/* ── Main ───────────────────────────────────────────────────────────────── */
const DashboardPage = () => {
  const navigate = useNavigate();
  const { stats, roomTypeStats, loading, error, toDate, setToDate, fetchData, blockedRoomTypes } = useDashboard();
  const [heatSearch, setHeatSearch] = useState('');
  const [heatSort, setHeatSort] = useState('pct-desc');
  const [syncStatus, setSyncStatus] = useState(null);

  // Priority queue — P1 and P2 confirmed bookings
  const [urgentBookings, setUrgentBookings] = useState([]);
  useEffect(() => {
    api.get('/prebooking', { params: { status: 'Confirmed' } })
      .then(r => {
        const urgent = (r.data.prebookings || []).filter(
          b => b.priority === 'P1-Emergency' || b.priority === 'P2-Urgent'
        );
        setUrgentBookings(urgent);
      })
      .catch(() => {});

    // Fetch HIS cache sync status
    api.get('/dashboard/sync-status').then(r => setSyncStatus(r.data)).catch(() => {});
  }, []);

  const patientCount    = stats?.patientCount    ?? 0;
  const bystanderCount  = stats?.bystanderCount  ?? 0;
  const prebookedBeds   = stats?.prebookedBeds   ?? 0;
  const restrictedBeds  = stats?.restrictedBeds  ?? 0;

  const roomTypeBreakdown = roomTypeStats.map((s) => ({
    ...s,
    available: Math.max(0, s.total - s.occupied),
    pct: s.total > 0 ? Math.round((s.occupied / s.total) * 100) : 0,
    bookingBlocked: blockedRoomTypes.has(s.roomType),
  }));

  const handleFilter = () => fetchData(toDate);
  const handleClear  = () => { setToDate(''); fetchData(''); };
  const goBook = (rt) => navigate('/book-bed', { state: { roomType: rt } });

  /* ── Alert strip: rooms >= 80% full ── */
  const alertRooms = roomTypeBreakdown.filter(r => r.pct >= 80).sort((a, b) => b.pct - a.pct);

  /* ── Donut ── */
  const occupancyPct = stats && stats.activeBeds > 0
    ? Math.round((stats.occupiedBeds / stats.activeBeds) * 100) : 0;
  const donutData = stats ? [
    { name: 'Occupied',   value: stats.occupiedBeds  ?? 0, color: '#ef4444' },
    { name: 'Pre-booked', value: prebookedBeds,             color: '#f97316' },
    { name: 'Available',  value: stats.availableBeds ?? 0, color: '#10b981' },
    { name: 'Inactive',   value: stats.inactiveBeds  ?? 0, color: '#e5e7eb' },
  ] : [];

  /* ── Bar chart: top 12 by % ── */
  const barData = [...roomTypeBreakdown]
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 12)
    .map(r => ({
      name: r.roomType.length > 16 ? r.roomType.slice(0, 15) + '…' : r.roomType,
      occupied:  r.occupied,
      available: r.available,
    }));

  /* ── Heatmap grid data ── */
  const sortFn = {
    'pct-desc': (a, b) => b.pct - a.pct,
    'pct-asc':  (a, b) => a.pct - b.pct,
    'alpha':    (a, b) => a.roomType.localeCompare(b.roomType),
    'free':     (a, b) => b.available - a.available,
  }[heatSort];

  const heatData = roomTypeBreakdown
    .filter(r => !heatSearch || r.roomType.toLowerCase().includes(heatSearch.toLowerCase()))
    .sort(sortFn);

  return (
    <Layout title="Dashboard">
      {/* ══════════════════════════════════════════════════════════════════
          ALERT STRIP
      ══════════════════════════════════════════════════════════════════ */}
      {alertRooms.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Capacity Alert</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {alertRooms.map(r => {
              const c = heatColor(r.pct);
              return (
                <button
                  key={r.roomType}
                  onClick={() => navigate('/occupied', { state: { roomFilter: r.roomType } })}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors hover:shadow-sm"
                  style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
                  {r.roomType}
                  <span className="font-black">{r.pct}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DATE FILTER BAR
      ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl px-5 py-3 mb-5 flex flex-wrap items-center gap-3">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Up to</label>
        <input
          type="date" value={toDate} max={today()}
          onChange={e => setToDate(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={handleFilter} disabled={loading}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {loading ? 'Loading…' : 'Apply'}
        </button>
        <button onClick={handleClear} disabled={loading}
          className="px-4 py-1.5 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-colors">
          Clear
        </button>
        {toDate && !loading && <span className="text-xs text-gray-400">Admissions up to {toDate}</span>}

        {/* HIS cache sync indicator */}
        {syncStatus && (
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
            syncStatus.lastHisSyncError
              ? 'bg-red-50 border-red-200 text-red-600'
              : 'bg-green-50 border-green-200 text-green-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${syncStatus.hisSyncRunning ? 'animate-pulse bg-blue-400' : syncStatus.lastHisSyncError ? 'bg-red-400' : 'bg-green-400'}`}/>
            {syncStatus.hisSyncRunning
              ? 'Syncing…'
              : syncStatus.lastHisSyncError
              ? 'Sync error'
              : syncStatus.lastHisSyncTime
              ? `HIS cache · ${new Date(syncStatus.lastHisSyncTime).toLocaleTimeString()}`
              : 'Not synced yet'}
          </span>
        )}

        <div className="ml-auto">
          <button onClick={() => goBook('')}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl px-5 py-2 shadow-sm transition-all text-sm font-bold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Book a Bed
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {/* ════════════════════════════════════════════════════════════
          PRIORITY QUEUE WIDGET
      ════════════════════════════════════════════════════════════ */}
      {urgentBookings.length > 0 && (
        <div className="mb-5 bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"/>
              <h3 className="text-sm font-black text-gray-800">Priority Queue</h3>
              <span className="ml-1 text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-bold">
                {urgentBookings.filter(b => b.priority === 'P1-Emergency').length} P1
              </span>
              <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-bold">
                {urgentBookings.filter(b => b.priority === 'P2-Urgent').length} P2
              </span>
            </div>
            <button onClick={() => navigate('/prebooking-report')}
              className="text-xs text-blue-600 font-semibold hover:underline">
              View All →
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {urgentBookings.slice(0, 5).map(b => {
              const isP1 = b.priority === 'P1-Emergency';
              return (
                <div key={b.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isP1 ? 'bg-red-500' : 'bg-orange-400'}`}/>
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full border flex-shrink-0 ${
                    isP1 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-orange-50 text-orange-700 border-orange-200'
                  }`}>
                    {isP1 ? 'P1' : 'P2'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{b.patientName}</p>
                    <p className="text-xs text-gray-400 truncate">
                      Bed {b.bedNo} · {b.roomType} · {b.priorityCategory !== 'General' ? b.priorityCategory : b.nurStation}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-gray-600">{b.bookedDate}</p>
                    {b.admissionReason && (
                      <p className="text-xs text-gray-400 max-w-32 truncate">{b.admissionReason}</p>
                    )}
                  </div>
                  <button onClick={() => navigate('/book-bed', { state: { roomType: b.roomType } })}
                    className="flex-shrink-0 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">
                    Assign
                  </button>
                </div>
              );
            })}
            {urgentBookings.length > 5 && (
              <div className="px-5 py-2.5 text-center">
                <button onClick={() => navigate('/prebooking-report')}
                  className="text-xs text-gray-400 hover:text-blue-600 font-semibold transition-colors">
                  +{urgentBookings.length - 5} more urgent bookings →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {stats && (
        <>
          {/* ════════════════════════════════════════════════════════════
              KPI CARDS — gradient row
          ════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
            <KpiCard label="Total Beds"  value={stats.totalBeds}
              gradient="bg-gradient-to-br from-slate-600 to-slate-800 shadow-md"
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>}
              onClick={() => navigate('/bed-list')} />
            <KpiCard label="Active"      value={stats.activeBeds}
              gradient="bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-md"
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
              onClick={() => navigate('/bed-list', { state: { statusFilter: 'Active' } })} />
            <KpiCard label="Inactive"    value={stats.inactiveBeds}
              gradient="bg-gradient-to-br from-gray-400 to-gray-600 shadow-md"
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>}
              onClick={() => navigate('/bed-list', { state: { statusFilter: 'Inactive' } })} />
            <KpiCard label="Occupied"    value={stats.occupiedBeds}
              gradient="bg-gradient-to-br from-red-500 to-rose-700 shadow-md"
              badge={`${occupancyPct}%`}
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20H7a2 2 0 01-2-2V9a2 2 0 012-2h1m8 0h1a2 2 0 012 2v9a2 2 0 01-2 2z"/></svg>}
              onClick={() => navigate('/occupied')} />
            <KpiCard label="Pre-booked"  value={prebookedBeds}   sub="beds held"
              gradient="bg-gradient-to-br from-orange-400 to-orange-600 shadow-md"
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>}
              onClick={() => navigate('/prebooking-report', { state: { statusFilter: 'Confirmed' } })} />
            <KpiCard label="Available"   value={stats.availableBeds} sub="bookable now"
              gradient="bg-gradient-to-br from-teal-500 to-teal-700 shadow-md"
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>}
              onClick={() => navigate('/book-bed')} />
            <KpiCard label="Patients"    value={patientCount}   sub="in beds"
              gradient="bg-gradient-to-br from-indigo-500 to-violet-700 shadow-md"
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>}
              onClick={() => navigate('/occupied', { state: { occBy: 'Patient' } })} />
            <KpiCard label="Bystanders"  value={bystanderCount} sub="sharing bed"
              gradient="bg-gradient-to-br from-amber-500 to-orange-600 shadow-md"
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20H7M12 4a4 4 0 110 8 4 4 0 010-8zM4 20a8 8 0 0116 0"/></svg>}
              onClick={() => navigate('/occupied', { state: { occBy: 'Bystander' } })} />
          </div>

          {/* ════════════════════════════════════════════════════════════
              CHARTS ROW — Donut + Bar
          ════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">

            {/* Donut */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Overall Occupancy</p>
              <div className="flex items-center gap-5">
                <div className="relative w-40 h-40 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%"
                        innerRadius={44} outerRadius={62}
                        paddingAngle={3} dataKey="value"
                        startAngle={90} endAngle={-270}
                        strokeWidth={0}
                      >
                        {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<DonutTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-black text-gray-900">{occupancyPct}%</span>
                    <span className="text-xs text-gray-400 font-medium">utilised</span>
                  </div>
                </div>
                <div className="flex flex-col gap-3 flex-1">
                  {donutData.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-md flex-shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-sm text-gray-500 flex-1">{d.name}</span>
                      <span className="text-lg font-black text-gray-800">{d.value}</span>
                    </div>
                  ))}
                  <div className="mt-1 pt-3 border-t border-gray-100 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Patients</span>
                      <span className="font-bold text-indigo-600">{patientCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Bystanders</span>
                      <span className="font-bold text-amber-600">{bystanderCount}</span>
                    </div>
                    {restrictedBeds > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Restricted</span>
                        <span className="font-bold text-purple-600">{restrictedBeds}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bar chart */}
            <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Top Room Types — Capacity</p>
              {loading ? (
                <div className="h-52 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={barData} layout="vertical"
                    margin={{ top: 0, right: 12, left: 8, bottom: 0 }} barSize={10} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={120}
                      tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<BarTip />} />
                    <Bar dataKey="occupied"  fill="#f87171" radius={[0, 5, 5, 0]} name="Occupied" />
                    <Bar dataKey="available" fill="#34d399" radius={[0, 5, 5, 0]} name="Available" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════
              CAPACITY HEATMAP GRID
          ════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Capacity Heatmap</p>
                <p className="text-xs text-gray-400 mt-0.5">{roomTypeBreakdown.length} room types</p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 ml-2">
                {[
                  { label: 'Critical ≥90%', dot: '#ef4444' },
                  { label: 'High ≥70%',     dot: '#f97316' },
                  { label: 'Moderate ≥40%', dot: '#eab308' },
                  { label: 'Low',           dot: '#22c55e' },
                  { label: 'Empty',         dot: '#d1d5db' },
                  { label: 'Booking Blocked', dot: '#7c3aed', bg: '#ede9fe' },
                ].map(l => (
                  <span key={l.label} className="flex items-center gap-1 text-xs"
                    style={{ color: l.bg ? '#6d28d9' : '#6b7280' }}>
                    <span className="w-2.5 h-2.5 rounded-full border"
                      style={{ backgroundColor: l.bg || l.dot, borderColor: l.dot }} />
                    {l.label}
                  </span>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
                  </svg>
                  <input
                    type="text" placeholder="Search room…" value={heatSearch}
                    onChange={e => setHeatSearch(e.target.value)}
                    className="pl-8 pr-3 border border-gray-200 rounded-xl py-1.5 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {/* Sort */}
                <select value={heatSort} onChange={e => setHeatSort(e.target.value)}
                  className="border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="pct-desc">Busiest first</option>
                  <option value="pct-asc">Emptiest first</option>
                  <option value="free">Most free</option>
                  <option value="alpha">A → Z</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-gray-400">Loading…</div>
            ) : heatData.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">No room types found.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                {heatData.map(({ roomType, total, occupied, available, pct, bookingBlocked }) => {
                  const c = heatColor(pct);
                  // Blocked rooms get a distinct purple/violet theme regardless of occupancy
                  const bg         = bookingBlocked ? '#f5f3ff' : c.bg;
                  const border     = bookingBlocked ? '#a78bfa' : c.border;
                  const dotColor   = bookingBlocked ? '#7c3aed' : c.dot;
                  const textColor  = bookingBlocked ? '#5b21b6' : c.text;
                  const barColor   = bookingBlocked ? '#8b5cf6' : c.dot;

                  return (
                    <div
                      key={roomType}
                      className="rounded-xl border-2 p-3 flex flex-col gap-2 transition-all hover:-translate-y-0.5 hover:shadow-md"
                      style={{ backgroundColor: bg, borderColor: border }}
                    >
                      {/* Name row */}
                      <div className="flex items-start gap-1.5">
                        <span className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: dotColor }} />
                        <p className="text-xs font-bold leading-tight truncate"
                          style={{ color: textColor }} title={roomType}>
                          {roomType}
                        </p>
                      </div>

                      {/* Booking blocked badge — purple pill */}
                      {bookingBlocked && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-black w-fit"
                          style={{ backgroundColor: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd' }}>
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                          </svg>
                          No Booking
                        </span>
                      )}

                      {/* Big number */}
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black leading-none" style={{ color: textColor }}>{occupied}</span>
                        <span className="text-xs text-gray-400 mb-0.5">/ {total}</span>
                      </div>

                      {/* Progress bar — purple for blocked */}
                      <div className="w-full bg-white rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: barColor }} />
                      </div>

                      {/* Footer row */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: textColor }}>
                          <span className="font-bold">{available}</span> free
                        </span>
                        <span className="text-xs font-black" style={{ color: textColor }}>{pct}%</span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-1.5 mt-0.5">
                        <button
                          onClick={() => navigate('/occupied', { state: { roomFilter: roomType } })}
                          className="flex-1 py-1 rounded-lg text-xs font-bold border-2 transition-colors bg-white"
                          style={{ borderColor: dotColor, color: textColor }}
                        >
                          View
                        </button>
                        {!bookingBlocked && available > 0 && (
                          <button
                            onClick={() => goBook(roomType)}
                            className="flex-1 py-1 rounded-lg text-xs font-bold text-white transition-colors"
                            style={{ backgroundColor: c.dot }}
                          >
                            + Book
                          </button>
                        )}
                        {bookingBlocked && (
                          <button
                            onClick={() => navigate('/settings', { state: { tab: 'restrictions' } })}
                            className="flex-1 py-1 rounded-lg text-xs font-bold text-white transition-colors hover:opacity-90"
                            style={{ backgroundColor: '#7c3aed' }}
                            title="Click to manage booking restrictions"
                          >
                            Manage
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {!stats && !loading && (
        <div className="text-center py-20 text-gray-400 text-sm">No data available.</div>
      )}
    </Layout>
  );
};

export default DashboardPage;
