import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_META = {
  'Discharge Requested': { bg: '#fefce8', border: '#fde047', color: '#a16207', dot: '#eab308', label: 'Requested' },
  'Discharge Entered':   { bg: '#fff7ed', border: '#fdba74', color: '#c2410c', dot: '#f97316', label: 'Entered'   },
  'Billed':              { bg: '#f0fdf4', border: '#86efac', color: '#15803d', dot: '#22c55e', label: 'Billed'    },
};

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

const RoomSuggestionsPage = () => {
  const navigate = useNavigate();

  const [selDate, setSelDate]     = useState(today());
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [lastSync, setLastSync]   = useState('');

  const [roomFilter, setRoomFilter] = useState('');
  const [search, setSearch]         = useState('');
  const [view, setView]             = useState('all'); // 'all' | 'billed' | 'pending'

  const [upcomingPatients, setUpcomingPatients] = useState([]);
  const [upcomingOpen, setUpcomingOpen]         = useState(true);

  useEffect(() => {
    const tomorrow = (() => {
      const d = new Date(); d.setDate(d.getDate() + 1);
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    })();
    api.get('/prebooking', { params: { status: 'Confirmed', dateFrom: tomorrow } })
      .then(r => setUpcomingPatients(r.data.prebookings || []))
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/dashboard/discharge-initiated', {
        params: { fromDate: selDate, toDate: selDate },
      });
      const patients = res.data.patients || [];
      setRows(patients.map(p => ({
        bedNo:      p.BED        || '',
        roomType:   p.ROOM_TYPE  || '',
        nurStation: p.NUR_STATION || '',
        roomNo:     '',
        ptName:     p.PT_NAME    || '',
        ptNo:       p.PT_NO      || '',
        doctor:     p.DOCTOR     || '',
        department: p.DEPARTMENT || '',
        discStatus: p.DISC_STATUS || 'Discharge Requested',
        admDate:    p.ADMISSION_DATE || '',
        discReq:    p.DISC_REQ_DATE || '',
        billedAt:   p.DISC_BILLED_TIME || '',
        isBilled:   p.DISC_STATUS === 'Billed',
      })));
      if (res.data.lastSyncedAt) setLastSync(res.data.lastSyncedAt);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [selDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const isToday = selDate === today();

  const allRoomTypes = [...new Set(rows.map(r => r.roomType).filter(Boolean))].sort();

  const applyFilters = (list) => list.filter(r => {
    if (roomFilter && r.roomType !== roomFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.bedNo      || '').toLowerCase().includes(q) ||
             (r.roomType   || '').toLowerCase().includes(q) ||
             (r.nurStation || '').toLowerCase().includes(q) ||
             (r.ptName     || '').toLowerCase().includes(q) ||
             (r.ptNo       || '').toLowerCase().includes(q) ||
             (r.doctor     || '').toLowerCase().includes(q);
    }
    return true;
  });

  const baseRows =
    view === 'billed'  ? rows.filter(r => r.isBilled) :
    view === 'pending' ? rows.filter(r => !r.isBilled) :
    rows;

  const displayRows = applyFilters(baseRows);

  const billedCount  = rows.filter(r => r.isBilled).length;
  const pendingCount = rows.filter(r => !r.isBilled).length;

  const handleBook = (row) => {
    navigate('/book-bed', {
      state: {
        suggestedBed: {
          bedNo:      row.bedNo,
          roomType:   row.roomType,
          nurStation: row.nurStation,
          ptName:     row.ptName,
          ptNo:       row.ptNo,
          doctor:     row.doctor,
          discStatus: row.discStatus,
          isBilled:   row.isBilled,
        },
      },
    });
  };

  const handleBookUpcoming = (p) => {
    navigate('/book-bed', {
      state: {
        upcomingPatient: {
          id:              p.id,
          patientName:     p.patientName,
          patientId:       p.patientId,
          patientPhone:    p.patientPhone,
          patientAge:      p.patientAge,
          patientGender:   p.patientGender,
          doctorName:      p.doctorName,
          notes:           p.notes,
          roomType:        p.roomType,
          nurStation:      p.nurStation,
          bedNo:           p.bedNo,
          bookedDate:      String(p.bookedDate).slice(0, 10),
          priority:        p.priority,
          isInsured:       p.isInsured,
          insuranceProvider: p.insuranceProvider,
          insurancePolicyNo: p.insurancePolicyNo,
        },
      },
    });
  };

  return (
    <Layout title="Available Beds">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-black text-gray-800">Today's Discharge Patients</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Patients in discharge queue — book their beds for new admissions
            {lastSync && <span className="ml-2 text-gray-300">· synced {new Date(lastSync).toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData}
            className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 rounded-xl px-4 py-2 text-sm font-semibold transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Refresh
          </button>
          <button onClick={() => navigate('/book-bed')}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            Book a Bed
          </button>
        </div>
      </div>

      {/* ── Date navigator ── */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl px-5 py-4 mb-5">
        <input type="date" value={selDate}
          onChange={e => setSelDate(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none mb-2"
        />
        <p className="text-xs text-gray-500 text-center mb-3">
          {fmtDate(selDate)}
          {isToday && <span className="ml-2 font-bold text-green-600">(Today)</span>}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => { const d = new Date(selDate); d.setDate(d.getDate()-1); setSelDate(d.toISOString().slice(0,10)); }}
            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl text-sm">← Prev</button>
          <button onClick={() => setSelDate(today())}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm">Today</button>
          <button onClick={() => { const d = new Date(selDate); d.setDate(d.getDate()+1); setSelDate(d.toISOString().slice(0,10)); }}
            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl text-sm">Next →</button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm text-center">
            <p className="text-2xl font-black text-orange-500">{rows.length}</p>
            <p className="text-xs text-gray-400 font-semibold mt-0.5">In Discharge Queue</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm text-center">
            <p className="text-2xl font-black text-green-600">{billedCount}</p>
            <p className="text-xs text-gray-400 font-semibold mt-0.5">Billed &amp; Ready</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm text-center">
            <p className="text-2xl font-black text-yellow-500">{pendingCount}</p>
            <p className="text-xs text-gray-400 font-semibold mt-0.5">Pending Billing</p>
          </div>
        </div>
      )}

      {/* ── Upcoming Patients Panel ── */}
      {upcomingPatients.length > 0 && (
        <div className="bg-white shadow-sm border border-violet-200 rounded-2xl mb-5 overflow-hidden">
          {/* Header */}
          <button
            onClick={() => setUpcomingOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 bg-gradient-to-r from-violet-50 to-purple-50 hover:from-violet-100 hover:to-purple-100 transition-colors"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-500 animate-pulse flex-shrink-0"/>
              <span className="text-sm font-black text-violet-800">Upcoming Patients</span>
              <span className="text-xs bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-bold">
                {upcomingPatients.length}
              </span>
              <span className="text-xs text-violet-500 hidden sm:inline">— Confirmed bookings for future dates · assign a bed</span>
            </div>
            <svg className={`w-4 h-4 text-violet-500 transition-transform flex-shrink-0 ${upcomingOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          {/* List */}
          {upcomingOpen && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['#', 'Patient', 'Room Type', 'Nursing Station', 'Requested Bed', 'Doctor', 'Admission Date', 'Priority', 'Action'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {upcomingPatients.map((p, i) => {
                    const bd = String(p.bookedDate).slice(0, 10);
                    const priorityStyle = {
                      Emergency: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c', dot: '#ef4444' },
                      VIP:       { bg: '#f5f3ff', border: '#ddd6fe', color: '#6d28d9', dot: '#8b5cf6' },
                      Regular:   { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', dot: '#3b82f6' },
                    }[p.priority] || { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', dot: '#3b82f6' };
                    return (
                      <tr key={p.id} className="hover:bg-violet-50/40 transition-colors">
                        <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-gray-800 whitespace-nowrap">{p.patientName || '—'}</p>
                          {p.patientId && <p className="text-xs font-mono text-blue-600 mt-0.5">{p.patientId}</p>}
                          {p.patientPhone && <p className="text-xs text-gray-400">{p.patientPhone}</p>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-semibold">{p.roomType || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{p.nurStation || '—'}</td>
                        <td className="px-4 py-3">
                          {p.bedNo
                            ? <span className="font-mono font-black text-gray-800">{p.bedNo}</span>
                            : <span className="text-xs text-gray-300">Not assigned</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{p.doctorName || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-xs font-black text-violet-700">
                            {new Date(bd + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
                            style={{ backgroundColor: priorityStyle.bg, borderColor: priorityStyle.border, color: priorityStyle.color }}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: priorityStyle.dot }}/>
                            {p.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button onClick={() => handleBookUpcoming(p)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                            </svg>
                            Assign Bed
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl px-4 py-3 mb-5 flex flex-wrap items-center gap-3">
        {/* View toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
          {[
            { key: 'all',     label: `All (${rows.length})` },
            { key: 'billed',  label: `Billed (${billedCount})` },
            { key: 'pending', label: `Pending (${pendingCount})` },
          ].map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`px-3 py-2 transition-colors ${view === v.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {v.label}
            </button>
          ))}
        </div>

        {/* Room type */}
        <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none w-full sm:w-auto">
          <option value="">All Room Types</option>
          {allRoomTypes.map(rt => <option key={rt} value={rt}>{rt}</option>)}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
          </svg>
          <input type="text" placeholder="Search bed, patient, doctor…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 border border-gray-200 rounded-xl py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"/>
        </div>

        <span className="text-xs text-gray-400 whitespace-nowrap">{displayRows.length} records</span>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600 mb-3"/>
          <p className="text-gray-500 text-sm">Loading discharge patients…</p>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && displayRows.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-6 py-14 text-center">
          <svg className="w-14 h-14 mx-auto text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          <h3 className="text-base font-bold text-gray-700 mb-1">No discharge patients</h3>
          <p className="text-sm text-gray-400 mb-5">No discharge records found for {fmtDate(selDate)}.</p>
          <button onClick={() => navigate('/book-bed')}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm">
            Browse All Available Beds
          </button>
        </div>
      )}

      {/* ── Table ── */}
      {!loading && displayRows.length > 0 && (
        <div className="bg-white shadow-sm border border-gray-100 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['#', 'Bed No', 'Room Type', 'Nursing Station', 'Patient', 'Doctor', 'Discharge Status', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayRows.map((row, i) => {
                  const sm = STATUS_META[row.discStatus] || STATUS_META['Discharge Requested'];
                  return (
                    <tr key={`${row.bedNo}-${i}`}
                      className={`hover:bg-gray-50 transition-colors ${row.isBilled ? 'bg-green-50/20' : ''}`}>

                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>

                      {/* Bed */}
                      <td className="px-4 py-3">
                        <span className="font-mono font-black text-gray-800">{row.bedNo || '—'}</span>
                      </td>

                      {/* Room Type */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-semibold">{row.roomType || '—'}</span>
                      </td>

                      {/* Nursing Station */}
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{row.nurStation || '—'}</td>

                      {/* Patient */}
                      <td className="px-4 py-3">
                        {row.ptName ? (
                          <div>
                            <p className="font-semibold text-gray-800 text-xs whitespace-nowrap">{row.ptName}</p>
                            <p className="text-xs text-gray-400 font-mono">{row.ptNo}</p>
                            {row.admDate && <p className="text-xs text-gray-300 mt-0.5">Adm: {row.admDate}</p>}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>

                      {/* Doctor */}
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-700 whitespace-nowrap">{row.doctor || '—'}</p>
                        {row.department && <p className="text-xs text-gray-400">{row.department}</p>}
                      </td>

                      {/* Discharge Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
                          style={{ backgroundColor: sm.bg, borderColor: sm.border, color: sm.color }}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: sm.dot }}/>
                          {row.discStatus}
                        </span>
                        {row.billedAt && (
                          <p className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">Billed: {row.billedAt}</p>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button onClick={() => handleBook(row)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                            row.isBilled
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                          </svg>
                          {row.isBilled ? 'Book Now' : 'Book Bed'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
            <span>{displayRows.length} patient{displayRows.length !== 1 ? 's' : ''} shown</span>
            <span className="hidden sm:inline">{billedCount} billed · {pendingCount} pending</span>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default RoomSuggestionsPage;
