import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { useDashboard, today } from '../context/DashboardContext';

const ROWS_PER_PAGE = 15;

const OccupiedBeds = () => {
  const location = useLocation();
  const { patients, loading, error, toDate, setToDate, fetchData } = useDashboard();
  const [search,      setSearch]      = useState('');
  const [roomFilter,  setRoomFilter]  = useState(location.state?.roomFilter || '');
  const [nsFilter,    setNsFilter]    = useState('');
  const [occByFilter, setOccByFilter] = useState(location.state?.occBy || '');
  const [page, setPage] = useState(1);

  const handleFilter = () => { fetchData(toDate); setPage(1); };
  const handleClear  = () => {
    setToDate(''); setSearch(''); setRoomFilter('');
    setNsFilter(''); setOccByFilter(''); setPage(1);
    fetchData('');
  };

  const roomTypes   = [...new Set(patients.map(p => p.ROOM_TYPE).filter(Boolean))].sort();
  const nurStations = [...new Set(patients.map(p => p.NUR_STATION).filter(Boolean))].sort();

  const filtered = patients.filter(p => {
    const s = search.toLowerCase();
    const matchSearch = !s ||
      (p.PT_NAME  || '').toLowerCase().includes(s) ||
      (p.PT_NO    || '').toLowerCase().includes(s) ||
      (p.BED      || '').toLowerCase().includes(s) ||
      (p.DOCTOR   || '').toLowerCase().includes(s) ||
      (p.ADDRESS  || '').toLowerCase().includes(s);
    const matchRoom  = !roomFilter  || p.ROOM_TYPE   === roomFilter;
    const matchNs    = !nsFilter    || p.NUR_STATION  === nsFilter;
    const matchOccBy = !occByFilter || p.OCCUPIED_BY  === occByFilter;
    return matchSearch && matchRoom && matchNs && matchOccBy;
  });

  // ── Summary counts (from all patients, not filtered) ──
  const totalOccupied   = new Set(patients.map(p => p.BED)).size;
  const patientCount    = patients.filter(p => p.OCCUPIED_BY === 'Patient').length;
  const bystanderCount  = patients.filter(p => p.OCCUPIED_BY === 'Bystander').length;

  // Per room-type counts (unique beds)
  const rtBedMap = {};
  for (const p of patients) {
    const rt = p.ROOM_TYPE || 'Unknown';
    if (!rtBedMap[rt]) rtBedMap[rt] = new Set();
    rtBedMap[rt].add(p.BED);
  }
  const roomTypeCounts = Object.entries(rtBedMap)
    .map(([rt, beds]) => ({ rt, count: beds.size }))
    .sort((a, b) => b.count - a.count);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginated  = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const toggleRoomFilter = (rt) => {
    setRoomFilter(prev => prev === rt ? '' : rt);
    setPage(1);
  };

  return (
    <Layout title="Occupied Beds">

      {/* ── KPI summary cards ── */}
      {!loading && patients.length > 0 && (
        <div className="mb-5">
          {/* Top row: total / patient / bystander */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <button
              onClick={() => { setOccByFilter(''); setPage(1); }}
              className={`rounded-2xl px-5 py-4 text-left border-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                occByFilter === '' ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-200'
              }`}>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Total Occupied Beds</p>
              <p className="text-3xl font-black text-blue-600">{totalOccupied}</p>
              <p className="text-xs text-gray-400 mt-1">{patients.length} person{patients.length !== 1 ? 's' : ''} in beds</p>
            </button>

            <button
              onClick={() => { setOccByFilter(occByFilter === 'Patient' ? '' : 'Patient'); setPage(1); }}
              className={`rounded-2xl px-5 py-4 text-left border-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                occByFilter === 'Patient' ? 'bg-green-50 border-green-400' : 'bg-white border-gray-200'
              }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-green-500"/>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Patients</p>
              </div>
              <p className="text-3xl font-black text-green-600">{patientCount}</p>
              <p className="text-xs text-gray-400 mt-1">admitted in beds</p>
            </button>

            <button
              onClick={() => { setOccByFilter(occByFilter === 'Bystander' ? '' : 'Bystander'); setPage(1); }}
              className={`rounded-2xl px-5 py-4 text-left border-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                occByFilter === 'Bystander' ? 'bg-amber-50 border-amber-400' : 'bg-white border-gray-200'
              }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-500"/>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Bystanders</p>
              </div>
              <p className="text-3xl font-black text-amber-600">{bystanderCount}</p>
              <p className="text-xs text-gray-400 mt-1">sharing a bed</p>
            </button>
          </div>

          {/* Room-type breakdown chips */}
          <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Occupied by Room Type</p>
            <div className="flex flex-wrap gap-2">
              {roomTypeCounts.map(({ rt, count }) => {
                const isActive = roomFilter === rt;
                // colour by share of total
                const pct = totalOccupied > 0 ? count / totalOccupied : 0;
                const color = pct >= 0.15
                  ? { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', dot: '#ef4444' }
                  : pct >= 0.08
                  ? { bg: '#fff7ed', border: '#fdba74', text: '#c2410c', dot: '#f97316' }
                  : pct >= 0.04
                  ? { bg: '#fefce8', border: '#fde047', text: '#a16207', dot: '#eab308' }
                  : { bg: '#f0fdf4', border: '#86efac', text: '#15803d', dot: '#22c55e' };

                return (
                  <button
                    key={rt}
                    onClick={() => toggleRoomFilter(rt)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all hover:-translate-y-0.5 hover:shadow-sm"
                    style={{
                      backgroundColor: isActive ? color.bg : '#f9fafb',
                      borderColor:     isActive ? color.border : '#e5e7eb',
                      color:           isActive ? color.text : '#6b7280',
                    }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: isActive ? color.dot : '#d1d5db' }}/>
                    {rt}
                    <span className="ml-0.5 font-black text-sm"
                      style={{ color: isActive ? color.text : '#374151' }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="bg-white shadow rounded-xl px-5 py-4 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Up to Date</label>
          <input
            type="date" value={toDate} max={today()}
            onChange={e => setToDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Room Type</label>
          <select value={roomFilter} onChange={e => { setRoomFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Room Types</option>
            {roomTypes.map(rt => <option key={rt} value={rt}>{rt}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nursing Station</label>
          <select value={nsFilter} onChange={e => { setNsFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Stations</option>
            {nurStations.map(ns => <option key={ns} value={ns}>{ns}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Occupied By</label>
          <select value={occByFilter} onChange={e => { setOccByFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All</option>
            <option value="Patient">Patient</option>
            <option value="Bystander">Bystander</option>
          </select>
        </div>

        <button onClick={handleFilter} disabled={loading}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors self-end">
          {loading ? 'Loading…' : 'Apply Filter'}
        </button>
        <button onClick={handleClear} disabled={loading}
          className="px-5 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors self-end">
          Clear All
        </button>

        <div className="flex-1" />

        <div className="flex flex-col gap-1 self-end">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text" placeholder="Search patient, bed, doctor…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 pr-3 border border-gray-300 rounded-lg py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <span className="text-sm text-gray-400 self-end pb-2">{filtered.length} records</span>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">{error}</div>
      )}

      <div className="bg-white shadow rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Sl#','Pt. No','Room Type','Patient','Address','Occupied By','Bed','Doctor','Date & Time','Nursing Station'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">No current in-patients found.</td></tr>
                ) : paginated.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-400">{(page - 1) * ROWS_PER_PAGE + i + 1}</td>
                    <td className="px-4 py-2.5 font-mono text-blue-600 whitespace-nowrap">{p.PT_NO}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-semibold">{p.ROOM_TYPE}</span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold whitespace-nowrap">{p.PT_NAME}</td>
                    <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate" title={p.ADDRESS}>{p.ADDRESS || '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.OCCUPIED_BY === 'Bystander'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {p.OCCUPIED_BY || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{p.BED}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{p.DOCTOR}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{p.ADMISSION_DATE}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{p.NUR_STATION}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages} — showing {paginated.length} of {filtered.length} records
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Previous</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default OccupiedBeds;
