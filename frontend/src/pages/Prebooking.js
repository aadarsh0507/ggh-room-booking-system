import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import RoomSuggestions from '../components/RoomSuggestions';
import api from '../services/api';

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_STYLES = {
  Confirmed: 'bg-green-100 text-green-700',
  Cancelled: 'bg-red-100 text-red-700',
  Admitted:  'bg-blue-100 text-blue-700',
};

const EMPTY_FORM = {
  bedNo: '', roomType: '', nurStation: '', roomNo: '',
  patientName: '', patientPhone: '', patientAge: '',
  patientGender: '', doctorName: '', notes: '', bookedDate: today(),
};

const ROWS_PER_PAGE = 12;

const Prebooking = () => {
  const location = useLocation();

  // ── available beds ──────────────────────────────────────────────────────────
  const [availBeds, setAvailBeds]       = useState([]);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError]     = useState('');

  // ── filters for bed grid ────────────────────────────────────────────────────
  const [filterRT, setFilterRT]   = useState(location.state?.roomType || '');
  const [filterNS, setFilterNS]   = useState('');
  const [bedSearch, setBedSearch] = useState('');

  // ── booking list / report ───────────────────────────────────────────────────
  const [prebookings, setPrebookings]     = useState([]);
  const [listLoading, setListLoading]     = useState(false);
  const [filterStatus, setFilterStatus]   = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo]     = useState('');
  const [filterRoomType, setFilterRoomType] = useState('');
  const [filterNurStation, setFilterNurStation] = useState('');
  const [listSearch, setListSearch]         = useState('');
  const [listPage, setListPage]             = useState(1);

  // ── form / modal ────────────────────────────────────────────────────────────
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [formError, setFormError]     = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [ptNoInput, setPtNoInput]     = useState('');
  const [ptLooking, setPtLooking]     = useState(false);
  const [ptLookError, setPtLookError] = useState('');
  const [ptFound, setPtFound]         = useState(false);
  const [autoFillNotes, setAutoFillNotes] = useState(false);

  // ── tab: 'book' | 'list' ────────────────────────────────────────────────────
  const [tab, setTab] = useState('book');

  // ── load available beds ─────────────────────────────────────────────────────
  const loadAvailBeds = useCallback(() => {
    setAvailLoading(true);
    setAvailError('');
    api.get('/prebooking/available-beds')
      .then(r => setAvailBeds(r.data.beds))
      .catch(err => setAvailError(
        err.response?.data?.message || err.message || 'Failed to load available beds.'
      ))
      .finally(() => setAvailLoading(false));
  }, []);

  // ── load prebooking report ──────────────────────────────────────────────────
  const loadList = useCallback(() => {
    setListLoading(true);
    const params = {};
    if (filterStatus)     params.status     = filterStatus;
    if (filterDateFrom)   params.dateFrom   = filterDateFrom;
    if (filterDateTo)     params.dateTo     = filterDateTo;
    if (filterRoomType)   params.roomType   = filterRoomType;
    if (filterNurStation) params.nurStation = filterNurStation;
    api.get('/prebooking', { params })
      .then(r => { setPrebookings(r.data.prebookings); setListPage(1); })
      .catch(() => {})
      .finally(() => setListLoading(false));
  }, [filterStatus, filterDateFrom, filterDateTo, filterRoomType, filterNurStation]);

  useEffect(() => { loadAvailBeds(); }, [loadAvailBeds]);
  useEffect(() => { if (tab === 'list') loadList(); }, [tab, loadList]);

  // ── derived bed list ────────────────────────────────────────────────────────
  const roomTypes    = [...new Set(availBeds.map(b => b.ROOM_TYPE).filter(Boolean))].sort();
  const nurStations  = [...new Set(availBeds.map(b => b.NUR_STATION).filter(Boolean))].sort();

  const filteredBeds = availBeds.filter(b => {
    if (filterRT && b.ROOM_TYPE !== filterRT) return false;
    if (filterNS && b.NUR_STATION !== filterNS) return false;
    if (bedSearch) {
      const s = bedSearch.toLowerCase();
      return (b.BED_NO      || '').toLowerCase().includes(s) ||
             (b.ROOM_TYPE   || '').toLowerCase().includes(s) ||
             (b.NUR_STATION || '').toLowerCase().includes(s) ||
             (b.ROOM_NO     || '').toLowerCase().includes(s);
    }
    return true;
  });

  // ── select a bed → open form ────────────────────────────────────────────────
  const handleSelectBed = (bed) => {
    setForm({
      ...EMPTY_FORM,
      bedNo:      bed.BED_NO,
      roomType:   bed.ROOM_TYPE,
      nurStation: bed.NUR_STATION,
      roomNo:     bed.ROOM_NO,
    });
    setPtNoInput('');
    setPtLookError('');
    setPtFound(false);
    setFormError('');
    setShowForm(true);
  };

  // ── auto-fill notes based on room type ──────────────────────────────────────
  const getAutoFilledNotes = (roomType) => {
    const roomTypeMap = {
      'AC Room': 'AC room - Air conditioned room with separate bathroom facilities.',
      'Non-AC Room': 'Non-AC room - Standard room without air conditioning.',
      'ICU': 'ICU - Intensive Care Unit with advanced monitoring equipment.',
      'Isolation': 'Isolation room - Strict infection control measures in place.',
    };
    return roomTypeMap[roomType] || '';
  };

  // ── lookup patient from HIS by PT_NO ────────────────────────────────────────
  const handleLookupPatient = async () => {
    if (!ptNoInput.trim()) return;
    setPtLooking(true);
    setPtLookError('');
    setPtFound(false);
    try {
      const res = await api.get(`/prebooking/patient/${encodeURIComponent(ptNoInput.trim())}`);
      const p = res.data.patient;
      let gender = '';
      const g = (p.GENDER || '').toLowerCase();
      if (g.startsWith('m')) gender = 'Male';
      else if (g.startsWith('f')) gender = 'Female';
      else if (g) gender = 'Other';

      setForm(f => ({
        ...f,
        patientName:   p.PT_NAME || '',
        patientGender: gender,
        doctorName:    p.DOCTOR  || '',
      }));
      setPtFound(true);
    } catch (err) {
      setPtLookError(err.response?.data?.message || 'Patient not found in HIS.');
    } finally {
      setPtLooking(false);
    }
  };

  // ── form submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.patientName.trim())  return setFormError('Patient name is required.');
    if (!form.patientPhone.trim()) return setFormError('Phone number is required.');
    if (!form.patientGender)       return setFormError('Gender is required.');
    if (!form.bookedDate)          return setFormError('Booking date is required.');

    setSubmitting(true);
    try {
      await api.post('/prebooking', form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      loadAvailBeds(); // refresh — booked bed disappears from grid
      setTab('list');
      loadList();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create booking.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── cancel / admit ──────────────────────────────────────────────────────────
  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this prebooking?')) return;
    await api.patch(`/prebooking/${id}/cancel`);
    loadList();
    loadAvailBeds();
  };

  const handleAdmit = async (id) => {
    if (!window.confirm('Mark this patient as admitted?')) return;
    await api.patch(`/prebooking/${id}/admit`);
    loadList();
    loadAvailBeds();
  };


  // ── derived room types / nursing stations from report data ─────────────────
  const reportRoomTypes   = [...new Set(prebookings.map(b => b.roomType).filter(Boolean))].sort();
  const reportNurStations = [...new Set(prebookings.map(b => b.nurStation).filter(Boolean))].sort();

  // ── client-side search on top of server filters ──────────────────────────
  const filteredList = prebookings.filter(b => {
    if (!listSearch) return true;
    const s = listSearch.toLowerCase();
    return (b.patientName || '').toLowerCase().includes(s) ||
           (b.bedNo       || '').toLowerCase().includes(s) ||
           (b.doctorName  || '').toLowerCase().includes(s) ||
           (b.bookedBy    || '').toLowerCase().includes(s);
  });

  // ── summary counts ────────────────────────────────────────────────────────
  const summaryConfirmed = prebookings.filter(b => b.status === 'Confirmed').length;
  const summaryCancelled = prebookings.filter(b => b.status === 'Cancelled').length;
  const summaryAdmitted  = prebookings.filter(b => b.status === 'Admitted').length;

  return (
    <Layout title="Pre-Booking">

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6 bg-white shadow rounded-xl p-1 w-fit">
        {[
          { key: 'book', label: 'Book a Bed',        icon: '🛏' },
          { key: 'list', label: 'Pre-Booking Report', icon: '📊' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              tab === t.key
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
        <button
          onClick={loadAvailBeds}
          className="ml-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition-colors"
          title="Refresh available beds"
        >
          ↺ Refresh
        </button>
      </div>

      {/* ══════════════════════ BOOK A BED tab ══════════════════════════════ */}
      {tab === 'book' && (
        <>
          {/* Filters */}
          <div className="bg-white shadow rounded-xl px-5 py-4 mb-5 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Room Type</label>
              <select
                value={filterRT}
                onChange={e => setFilterRT(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">All Types</option>
                {roomTypes.map(rt => <option key={rt} value={rt}>{rt}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nursing Station</label>
              <select
                value={filterNS}
                onChange={e => setFilterNS(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">All Stations</option>
                {nurStations.map(ns => <option key={ns} value={ns}>{ns}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 w-full sm:flex-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Search</label>
              <input
                type="text"
                placeholder="Bed no, room, station…"
                value={bedSearch}
                onChange={e => setBedSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-end pb-0.5">
              <span className="text-sm text-gray-400">
                <span className="font-semibold text-green-600">{filteredBeds.length}</span> beds available
              </span>
            </div>
          </div>

          {availError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">{availError}</div>
          )}

          {availLoading ? (
            <div className="py-20 text-center text-gray-400">Loading available beds…</div>
          ) : filteredBeds.length === 0 ? (
            <div className="py-20 text-center text-gray-400">No available beds match the selected filters.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filteredBeds.map(bed => (
                <button
                  key={bed.BED_NO}
                  onClick={() => handleSelectBed(bed)}
                  className="bg-white border-2 border-green-200 rounded-xl p-3 text-left hover:border-blue-400 hover:shadow-lg transition-all group"
                >
                  {/* Status dot */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      Available
                    </span>
                    <span className="text-xs text-gray-400 group-hover:text-blue-500 font-medium">Book →</span>
                  </div>

                  {/* Bed number */}
                  <p className="text-lg font-bold text-gray-800 leading-tight">{bed.BED_NO}</p>

                  {/* Room type */}
                  <p className="text-xs text-blue-600 font-medium mt-0.5 truncate">{bed.ROOM_TYPE}</p>

                  {/* Station + Room */}
                  <div className="mt-2 space-y-0.5">
                    <p className="text-xs text-gray-500 truncate">{bed.NUR_STATION}</p>
                    <p className="text-xs text-gray-400 truncate">Room: {bed.ROOM_NO}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════ PRE-BOOKING REPORT tab ═══════════════════════ */}
      {tab === 'list' && (
        <>
          {/* Report filters */}
          <div className="bg-white shadow rounded-xl px-5 py-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              {/* Date From */}
              <div className="flex flex-col gap-1 w-full sm:w-auto">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">From Date</label>
                <input type="date" value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              {/* Date To */}
              <div className="flex flex-col gap-1 w-full sm:w-auto">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">To Date</label>
                <input type="date" value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              {/* Status */}
              <div className="flex flex-col gap-1 w-full sm:w-auto">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">All Status</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Admitted">Admitted</option>
                </select>
              </div>
              {/* Room Type */}
              <div className="flex flex-col gap-1 w-full sm:w-auto">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Room Type</label>
                <select value={filterRoomType} onChange={e => setFilterRoomType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">All Types</option>
                  {[...new Set(availBeds.map(b => b.ROOM_TYPE).filter(Boolean))].sort().map(rt =>
                    <option key={rt} value={rt}>{rt}</option>
                  )}
                </select>
              </div>
              {/* Nursing Station */}
              <div className="flex flex-col gap-1 w-full sm:w-auto">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nursing Station</label>
                <select value={filterNurStation} onChange={e => setFilterNurStation(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">All Stations</option>
                  {[...new Set(availBeds.map(b => b.NUR_STATION).filter(Boolean))].sort().map(ns =>
                    <option key={ns} value={ns}>{ns}</option>
                  )}
                </select>
              </div>
              {/* Buttons */}
              <button onClick={() => { loadList(); setListPage(1); }} disabled={listLoading}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors self-end"
              >
                {listLoading ? 'Loading…' : 'Apply Filter'}
              </button>
              <button onClick={() => {
                setFilterDateFrom(''); setFilterDateTo(''); setFilterStatus('');
                setFilterRoomType(''); setFilterNurStation(''); setListSearch(''); setListPage(1);
                setTimeout(loadList, 0);
              }}
                className="px-5 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors self-end"
              >Clear All</button>

              {/* Search */}
              <div className="w-full sm:flex-1 flex flex-col gap-1 self-end">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input type="text" placeholder="Search patient, bed, doctor…"
                    value={listSearch} onChange={e => { setListSearch(e.target.value); setListPage(1); }}
                    className="w-full pl-9 pr-3 border border-gray-300 rounded-lg py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          {prebookings.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Total',     value: prebookings.length, color: 'bg-blue-50 text-blue-700 border-blue-200' },
                { label: 'Confirmed', value: summaryConfirmed,   color: 'bg-green-50 text-green-700 border-green-200' },
                { label: 'Admitted',  value: summaryAdmitted,    color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
                { label: 'Cancelled', value: summaryCancelled,   color: 'bg-red-50 text-red-700 border-red-200' },
              ].map(c => (
                <div key={c.label} className={`rounded-xl border px-4 py-3 flex items-center justify-between ${c.color}`}>
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className="text-2xl font-bold">{c.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white shadow rounded-xl overflow-hidden">
            {listLoading ? (
              <div className="py-16 text-center text-gray-400">
                <svg className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Loading report…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['#','Bed No','Room Type','Nursing Station','Patient','Gender','Doctor','Booked Date','Booked By','IP Address','Status','Actions'].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredList.length === 0 ? (
                      <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-400">
                        No records found. Apply filters and click <strong>Apply Filter</strong>.
                      </td></tr>
                    ) : filteredList.slice((listPage - 1) * ROWS_PER_PAGE, listPage * ROWS_PER_PAGE).map((b, i) => (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 text-gray-400 text-xs">{(listPage - 1) * ROWS_PER_PAGE + i + 1}</td>
                        <td className="px-3 py-2.5 font-mono font-semibold text-gray-800">{b.bedNo}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-medium">{b.roomType}</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 text-xs">{b.nurStation}</td>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">{b.patientName}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs">{b.patientGender}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 text-xs">{b.doctorName || '—'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-medium text-xs">{b.bookedDate?.slice(0,10)}</td>
                        <td className="px-3 py-2.5">
                          <div className="text-xs font-medium text-gray-800">{b.bookedBy}</div>
                          <div className="text-xs text-gray-400">{new Date(b.createdAt).toLocaleString('en-GB')}</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{b.clientIp || '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[b.status]}`}>
                            {b.status}
                          </span>
                          {b.status === 'Cancelled' && b.cancelledBy && (
                            <div className="text-xs text-gray-400 mt-0.5">by {b.cancelledBy}</div>
                          )}
                          {b.status === 'Admitted' && b.admittedBy && (
                            <div className="text-xs text-gray-400 mt-0.5">by {b.admittedBy}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {b.status === 'Confirmed' && (
                            <div className="flex gap-1.5">
                              <button onClick={() => handleAdmit(b.id)}
                                className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-medium hover:bg-blue-100 transition-colors"
                              >Admit</button>
                              <button onClick={() => handleCancel(b.id)}
                                className="px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-medium hover:bg-red-100 transition-colors"
                              >Cancel</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!listLoading && Math.ceil(filteredList.length / ROWS_PER_PAGE) > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {filteredList.length} records · Page {listPage} of {Math.ceil(filteredList.length / ROWS_PER_PAGE)}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setListPage(p => Math.max(1, p - 1))} disabled={listPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Previous</button>
                  <button onClick={() => setListPage(p => Math.min(Math.ceil(filteredList.length / ROWS_PER_PAGE), p + 1))} disabled={listPage === Math.ceil(filteredList.length / ROWS_PER_PAGE)}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════ BOOKING FORM MODAL ════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Pre-Book Bed</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  <span className="font-mono font-semibold text-blue-600">{form.bedNo}</span>
                  {' · '}{form.roomType}{' · '}{form.nurStation}
                </p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">✕</button>
            </div>

            {/* Room Suggestions */}
            <div className="px-6 pt-5">
              <RoomSuggestions
                roomType={form.roomType}
                nurStation={form.nurStation}
                bookedDate={form.bookedDate}
                onSelectBed={(suggestion) => {
                  setForm(f => ({
                    ...f,
                    bedNo: suggestion.bedNo,
                    roomType: suggestion.roomType,
                    nurStation: suggestion.nurStation,
                    roomNo: suggestion.roomNo,
                  }));
                }}
              />
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* Bed info (read-only) */}
              <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-400">Bed No</span><p className="font-mono font-bold text-gray-800">{form.bedNo}</p></div>
                <div><span className="text-gray-400">Room Type</span><p className="font-medium text-blue-600">{form.roomType}</p></div>
                <div><span className="text-gray-400">Nursing Station</span><p className="text-gray-700">{form.nurStation}</p></div>
                <div><span className="text-gray-400">Room No</span><p className="text-gray-700">{form.roomNo}</p></div>
              </div>

              {/* ── Patient ID lookup ── */}
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                <label className="block text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1.5">
                  Patient ID (HIS Lookup)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ptNoInput}
                    onChange={e => { setPtNoInput(e.target.value.toUpperCase()); setPtFound(false); setPtLookError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleLookupPatient()}
                    placeholder="e.g. GG00137786"
                    className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleLookupPatient}
                    disabled={ptLooking || !ptNoInput.trim()}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {ptLooking ? 'Searching…' : 'Fetch'}
                  </button>
                </div>
                {ptLookError && (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <span>✕</span>{ptLookError}
                  </p>
                )}
                {ptFound && (
                  <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
                    <span>✓</span>Patient details filled from HIS
                  </p>
                )}
              </div>

              {/* Patient details */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Patient Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.patientName}
                  onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))}
                  placeholder="Full name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Phone <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    value={form.patientPhone}
                    onChange={e => setForm(f => ({ ...f, patientPhone: e.target.value }))}
                    placeholder="Mobile number"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Age</label>
                  <input
                    type="number"
                    min="0" max="120"
                    value={form.patientAge}
                    onChange={e => setForm(f => ({ ...f, patientAge: e.target.value }))}
                    placeholder="Years"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Gender <span className="text-red-500">*</span></label>
                  <select
                    value={form.patientGender}
                    onChange={e => setForm(f => ({ ...f, patientGender: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Booking Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={form.bookedDate}
                    min={today()}
                    onChange={e => setForm(f => ({ ...f, bookedDate: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Doctor Name</label>
                <input
                  type="text"
                  value={form.doctorName}
                  onChange={e => setForm(f => ({ ...f, doctorName: e.target.value }))}
                  placeholder="Referring / treating doctor"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Notes</label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Auto-fill from room type:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAutoFillNotes(!autoFillNotes);
                        if (!autoFillNotes && form.roomType) {
                          const notes = getAutoFilledNotes(form.roomType);
                          if (notes) {
                            setForm(f => ({ ...f, notes }));
                          }
                        } else {
                          setForm(f => ({ ...f, notes: '' }));
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        autoFillNotes ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          autoFillNotes ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any special requirements or remarks…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                />
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{formError}</div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {submitting ? 'Booking…' : 'Confirm Booking'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Prebooking;
