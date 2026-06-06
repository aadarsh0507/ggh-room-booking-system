import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';

const STATUS_META = {
  'Discharge Requested': { bg: '#fefce8', border: '#fde047', color: '#a16207', dot: '#eab308', label: 'Disc. Requested' },
  'Discharge Entered':   { bg: '#fff7ed', border: '#fdba74', color: '#c2410c', dot: '#f97316', label: 'Disc. Entered'   },
  'Billed':              { bg: '#fef2f2', border: '#fca5a5', color: '#b91c1c', dot: '#ef4444', label: 'Billed'          },
};

const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META['Discharge Requested'];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border whitespace-nowrap"
      style={{ backgroundColor: m.bg, borderColor: m.border, color: m.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.dot }}/>
      {m.label}
    </span>
  );
};

const today = () => new Date().toISOString().slice(0, 10);

const DischargeInitiated = () => {
  const [patients, setPatients]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [search, setSearch]             = useState('');
  const [roomFilter, setRoomFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate]         = useState(today());
  const [toDate, setToDate]             = useState(today());
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [activePreset, setActivePreset] = useState('today');

  const applyPreset = (preset) => {
    const now = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    setActivePreset(preset);
    if (preset === 'today') {
      setFromDate(fmt(now)); setToDate(fmt(now));
    } else if (preset === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      setFromDate(fmt(y)); setToDate(fmt(y));
    } else if (preset === '7d') {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      setFromDate(fmt(s)); setToDate(fmt(now));
    } else if (preset === '30d') {
      const s = new Date(now); s.setDate(s.getDate() - 29);
      setFromDate(fmt(s)); setToDate(fmt(now));
    } else if (preset === 'all') {
      setFromDate(''); setToDate('');
    }
  };

  const load = useCallback(async (fd, td) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (fd) params.fromDate = fd;
      if (td) params.toDate   = td;
      const res = await api.get('/dashboard/discharge-initiated', { params });
      setPatients(res.data.patients);
      if (res.data.lastSyncedAt) setLastSyncedAt(new Date(res.data.lastSyncedAt));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load discharge-initiated patients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(today(), today()); }, []);

  const handleApply = () => {
    setActivePreset('');
    load(fromDate, toDate);
  };

  const handleClear = () => {
    setFromDate(''); setToDate(''); setActivePreset('all');
    load('', '');
  };

  const roomTypes = [...new Set(patients.map(p => p.ROOM_TYPE).filter(Boolean))].sort();

  const filtered = patients.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (p.PT_NAME    || '').toLowerCase().includes(q) ||
      (p.PT_NO      || '').toString().includes(q) ||
      (p.BED        || '').toLowerCase().includes(q) ||
      (p.DOCTOR     || '').toLowerCase().includes(q) ||
      (p.DEPARTMENT || '').toLowerCase().includes(q);
    const matchRoom   = !roomFilter   || p.ROOM_TYPE  === roomFilter;
    const matchStatus = !statusFilter || p.DISC_STATUS === statusFilter;
    return matchSearch && matchRoom && matchStatus;
  });

  const countReq     = patients.filter(p => p.DISC_STATUS === 'Discharge Requested').length;
  const countEntered = patients.filter(p => p.DISC_STATUS === 'Discharge Entered').length;
  const countBilled  = patients.filter(p => p.DISC_STATUS === 'Billed').length;

  const PRESETS = [
    { key: 'today',     label: 'Today'      },
    { key: 'yesterday', label: 'Yesterday'  },
    { key: '7d',        label: 'Last 7 days'},
    { key: '30d',       label: 'Last 30 days'},
    { key: 'all',       label: 'All'        },
  ];

  return (
    <Layout title="Discharge Initiated">

      {/* ── KPI summary ── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Discharge Requested', value: countReq,     meta: STATUS_META['Discharge Requested'], key: 'Discharge Requested' },
          { label: 'Discharge Entered',   value: countEntered, meta: STATUS_META['Discharge Entered'],   key: 'Discharge Entered'   },
          { label: 'Billed / Final',      value: countBilled,  meta: STATUS_META['Billed'],              key: 'Billed'              },
        ].map(c => (
          <button key={c.key}
            onClick={() => setStatusFilter(statusFilter === c.key ? '' : c.key)}
            className="rounded-2xl px-5 py-4 text-left border-2 transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{
              backgroundColor: statusFilter === c.key ? c.meta.bg : '#fff',
              borderColor: statusFilter === c.key ? c.meta.border : '#e5e7eb',
            }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.meta.dot }}/>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{c.label}</p>
            </div>
            <p className="text-3xl font-black" style={{ color: c.meta.color }}>{c.value}</p>
          </button>
        ))}
      </div>

      {/* ── Date filter card ── */}
      <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 mb-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Label */}
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Filter by Disc. Request Date</span>

          {/* Preset chips */}
          <div className="flex gap-1.5 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  activePreset === p.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                }`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <span className="text-gray-200 font-light hidden sm:block">|</span>

          {/* Custom range */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 whitespace-nowrap">From</span>
              <input type="date" value={fromDate} max={toDate || today()}
                onChange={e => { setFromDate(e.target.value); setActivePreset(''); }}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 whitespace-nowrap">To</span>
              <input type="date" value={toDate} min={fromDate} max={today()}
                onChange={e => { setToDate(e.target.value); setActivePreset(''); }}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <button onClick={handleApply}
              className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors">
              Apply
            </button>
            {(fromDate || toDate) && (
              <button onClick={handleClear}
                className="px-3 py-1.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:border-red-300 hover:text-red-500 transition-colors">
                Clear
              </button>
            )}
          </div>

          {/* Sync time */}
          {lastSyncedAt && (
            <span className="ml-auto text-xs text-gray-400 whitespace-nowrap flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"/>
              Synced {lastSyncedAt.toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Active filter indicator */}
        {(fromDate || toDate) && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-xs text-blue-600 font-semibold">
              Showing:&nbsp;
              {fromDate && toDate
                ? `${fromDate} → ${toDate}`
                : fromDate
                  ? `From ${fromDate}`
                  : `Up to ${toDate}`}
            </span>
            <span className="text-xs text-gray-400">
              ({filtered.length} patient{filtered.length !== 1 ? 's' : ''} after search/status filter)
            </span>
          </div>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
          </svg>
          <input type="text" placeholder="Search patient, bed, doctor, department…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        </div>

        <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Room Types</option>
          {roomTypes.map(rt => <option key={rt} value={rt}>{rt}</option>)}
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Statuses</option>
          <option value="Discharge Requested">Discharge Requested</option>
          <option value="Discharge Entered">Discharge Entered</option>
          <option value="Billed">Billed</option>
        </select>

        <button onClick={() => load(fromDate, toDate)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Refresh
        </button>

        <span className="text-sm text-gray-500 ml-auto font-semibold">
          {loading ? '…' : `${filtered.length} patient${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {/* ── Table ── */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">
            <svg className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Loading…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['#','Pt. No','Patient','Room Type','Bed','Doctor','Department','Nursing Station','Admission','Disc. Request','Disc. Entry','Status'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-gray-400">
                      No discharge-initiated patients found.
                    </td>
                  </tr>
                ) : filtered.map((p, i) => (
                  <tr key={`${p.PT_NO}-${p.BED}-${i}`}
                    className="hover:bg-orange-50 transition-colors"
                    style={p.DISC_STATUS === 'Discharge Requested' ? { backgroundColor: '#fefce8' } : {}}>
                    <td className="px-3 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700 whitespace-nowrap">{p.PT_NO}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-gray-800 whitespace-nowrap">{p.PT_NAME || '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{p.ADDRESS || ''}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-semibold whitespace-nowrap">{p.ROOM_TYPE || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-black text-gray-800 whitespace-nowrap">{p.BED}</td>
                    <td className="px-3 py-2.5 text-gray-600 text-xs whitespace-nowrap">{p.DOCTOR || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{p.DEPARTMENT || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{p.NUR_STATION || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{p.ADMISSION_DATE || '—'}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {p.DISC_REQ_DATE
                        ? <span className="text-yellow-700 font-semibold">{p.DISC_REQ_DATE}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {p.DISC_ENTRY_TIME
                        ? <span className="text-orange-600 font-semibold">{p.DISC_ENTRY_TIME}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={p.DISC_STATUS || 'Discharge Requested'}/>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default DischargeInitiated;
