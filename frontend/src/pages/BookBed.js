import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import { useDashboard } from '../context/DashboardContext';

const today = () => new Date().toISOString().slice(0, 10);

const PRIORITY_OPTIONS = [
  { value: 'Emergency', label: 'Emergency', color: '#dc2626', bg: '#fef2f2', desc: 'Critical — immediate admission required' },
  { value: 'VIP',       label: 'VIP',       color: '#7c3aed', bg: '#f5f3ff', desc: 'VIP patient — priority admission' },
  { value: 'Regular',   label: 'Regular',   color: '#2563eb', bg: '#eff6ff', desc: 'Planned admission — standard queue' },
];

const CATEGORY_OPTIONS = [
  { value: 'General',   label: 'General' },
  { value: 'Emergency', label: 'Emergency / ICU' },
  { value: 'VIP',       label: 'VIP' },
];

// Category → minimum priority level
const CATEGORY_MIN_PRIORITY = {
  'Emergency': 'Emergency',
  'VIP':       'VIP',
  'General':   'Regular',
};

const PRIORITY_RANK = { 'Emergency': 1, 'VIP': 2, 'Regular': 3 };
const higherPriority = (a, b) => PRIORITY_RANK[a] <= PRIORITY_RANK[b] ? a : b;

const EMPTY_FORM = {
  bedNo: '', roomType: '', nurStation: '', roomNo: '',
  patientName: '', patientPhone: '', patientAge: '', patientId: '',
  patientGender: '', doctorName: '', notes: '',
  priority: 'Regular', priorityCategory: 'General', admissionReason: '',
  advanceCollected: false, advanceAmount: '',
  isInsured: false, insuranceProvider: '', insurancePolicyNo: '',
};

const BookBed = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { blockedRoomTypes } = useDashboard();

  // Date picker — drives the availability query
  const [forDate, setForDate] = useState(today());

  const [allBeds, setAllBeds]           = useState([]); // all beds returned (available + occupied + prebooked)
  const [windowDays, setWindowDays]     = useState(3);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError]     = useState('');

  // Suggested bed passed from Available Beds page (discharge patient)
  const suggestedBed = location.state?.suggestedBed || null;

  const [filterRT, setFilterRT]     = useState(suggestedBed?.roomType || location.state?.roomType || '');
  const [filterNS, setFilterNS]     = useState('');
  const [filterShow, setFilterShow] = useState('available'); // 'all' | 'available'
  const [bedSearch, setBedSearch]   = useState('');
  const [suggDismissed, setSuggDismissed] = useState(false);

  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formError, setFormError]   = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [ptNoInput, setPtNoInput]     = useState('');
  const [ptLooking, setPtLooking]     = useState(false);
  const [ptLookError, setPtLookError] = useState('');
  const [ptFound, setPtFound]         = useState(false);

  const [successBed, setSuccessBed]         = useState('');
  const [displacedInfo, setDisplacedInfo]   = useState(null);
  const [cardPreview, setCardPreview]       = useState(null); // bed object being previewed

  const loadBeds = useCallback((date) => {
    setAvailLoading(true);
    setAvailError('');
    api.get('/prebooking/available-beds', { params: { forDate: date } })
      .then(r => {
        setAllBeds(r.data.beds || []);
        setWindowDays(r.data.windowDays ?? 3);
      })
      .catch(err => setAvailError(err.response?.data?.message || 'Failed to load beds.'))
      .finally(() => setAvailLoading(false));
  }, []);

  useEffect(() => { loadBeds(forDate); }, [forDate, loadBeds]);

  // Close card preview on Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setCardPreview(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Auto-highlight the suggested bed card when beds load
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (!suggestedBed || suggDismissed || autoOpened || availLoading || allBeds.length === 0) return;
    const match = allBeds.find(b => b.BED_NO === suggestedBed.bedNo && b.AVAILABLE);
    if (match) {
      setAutoOpened(true);
      setCardPreview(match); // open the card popup automatically
    }
  }, [allBeds, availLoading]); // eslint-disable-line

  const availableBeds = allBeds.filter(b => b.AVAILABLE);
  const occupiedBeds  = allBeds.filter(b => b.OCCUPIED);
  const prebookedBeds = allBeds.filter(b => b.PREBOOKED && !b.OCCUPIED);

  const roomTypes   = [...new Set(allBeds.map(b => b.ROOM_TYPE).filter(Boolean))].sort();
  const nurStations = [...new Set(allBeds.map(b => b.NUR_STATION).filter(Boolean))].sort();

  const baseList = filterShow === 'available' ? availableBeds : allBeds;
  const filteredBeds = baseList.filter(b => {
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

  const handleSelectBed = (bed) => {
    if (!bed.AVAILABLE) return;
    const isSugg = suggestedBed && !suggDismissed && bed.BED_NO === suggestedBed.bedNo;
    setForm({
      ...EMPTY_FORM,
      bedNo:       bed.BED_NO,
      roomType:    bed.ROOM_TYPE,
      nurStation:  bed.NUR_STATION,
      roomNo:      bed.ROOM_NO || '',
      ...(isSugg ? {
        patientName: suggestedBed.ptName || '',
        patientId:   suggestedBed.ptNo   || '',
        doctorName:  suggestedBed.doctor  || '',
      } : {}),
    });
    if (isSugg && suggestedBed.ptNo) setPtNoInput(suggestedBed.ptNo);
    else setPtNoInput('');
    setPtLookError(''); setPtFound(false); setFormError('');
    setShowForm(true);
  };

  const handleLookupPatient = async () => {
    if (!ptNoInput.trim()) return;
    setPtLooking(true); setPtLookError(''); setPtFound(false);
    try {
      const res = await api.get(`/prebooking/patient/${encodeURIComponent(ptNoInput.trim())}`);
      const p = res.data.patient;
      const g = (p.GENDER || '').toLowerCase();
      const gender = g.startsWith('m') ? 'Male' : g.startsWith('f') ? 'Female' : g ? 'Other' : '';
      setForm(f => ({ ...f, patientId: p.PT_NO || '', patientName: p.PT_NAME || '', patientGender: gender, doctorName: p.DOCTOR || '', patientPhone: p.PHONE || '', patientAge: p.AGE ?? '' }));
      setPtFound(true);
    } catch (err) {
      setPtLookError(err.response?.data?.message || 'Patient not found in HIS.');
    } finally {
      setPtLooking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.patientName.trim())  return setFormError('Patient name is required.');
    if (!form.patientPhone.trim()) return setFormError('Phone number is required.');
    if (!form.patientGender)       return setFormError('Gender is required.');
    if (!form.notes.trim())        return setFormError('Notes / special requirements is required.');
    setSubmitting(true);
    try {
      const res = await api.post('/prebooking', { ...form, bookedDate: forDate });
      const bookedBedNo = form.bedNo;
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessBed(bookedBedNo);
      setDisplacedInfo(res.data.displaced || null);
      loadBeds(forDate);
      setTimeout(() => { setSuccessBed(''); setDisplacedInfo(null); }, 6000);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create booking.');
    } finally {
      setSubmitting(false);
    }
  };

  const dateLabel = forDate === today()
    ? 'Today'
    : new Date(forDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Layout title="Book a Bed">
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-black text-gray-800">Book a Bed</h2>
          <p className="text-xs text-gray-400 mt-0.5">Enter the patient's requested admission date, then select an available bed</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadBeds(forDate)}
            className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 rounded-xl px-4 py-2 text-sm font-semibold transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Refresh
          </button>
          <button onClick={() => navigate('/prebooking-report')}
            className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 rounded-xl px-4 py-2 text-sm font-semibold transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            View Report
          </button>
        </div>
      </div>

      {/* ── STEP 1: Date picker — prominent card ── */}
      <div className={`rounded-2xl border-2 px-6 py-5 mb-5 shadow-sm transition-colors ${forDate > today() ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-blue-200'}`}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${forDate > today() ? 'bg-indigo-500' : 'bg-blue-500'}`}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Step 1 — Patient's requested admission date</p>
              <p className="text-xs text-gray-500 mt-0.5">Ask the patient when they want to come in and enter that date below</p>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <input
              type="date"
              value={forDate}
              min={today()}
              onChange={e => setForDate(e.target.value)}
              className={`border-2 rounded-xl px-4 py-2.5 text-base font-bold focus:outline-none focus:ring-2 transition-colors cursor-pointer ${
                forDate > today()
                  ? 'border-indigo-400 text-indigo-700 bg-white focus:ring-indigo-300'
                  : 'border-blue-400 text-blue-700 bg-white focus:ring-blue-300'
              }`}
            />
            <div className={`rounded-xl px-4 py-2.5 text-center min-w-24 ${forDate > today() ? 'bg-indigo-500' : 'bg-blue-500'}`}>
              <p className="text-2xl font-black text-white leading-none">{availableBeds.length}</p>
              <p className="text-xs text-white text-opacity-80 mt-0.5">beds free</p>
            </div>
          </div>
        </div>

        {/* Context message */}
        <div className={`mt-3 rounded-xl px-4 py-2.5 text-xs font-medium flex items-center gap-2 ${forDate > today() ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-50 text-blue-700'}`}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z"/>
          </svg>
          {forDate > today()
            ? <>Showing availability for <strong>{dateLabel}</strong>. Currently occupied beds are <strong>included</strong> — today's patients are expected to be discharged by then. Only beds with another prebooking near {dateLabel} are blocked.</>
            : <>Showing availability for <strong>Today</strong>. Beds currently occupied in HIS are excluded. To see beds that may free up later, select a future date above.</>
          }
        </div>
      </div>

      {/* ── Bed summary chips ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setFilterShow('available')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${filterShow === 'available' ? 'bg-green-500 text-white border-green-500' : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'}`}>
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block"/>
          {availableBeds.length} Available
        </button>
        <button onClick={() => setFilterShow('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${filterShow === 'all' ? 'bg-gray-600 text-white border-gray-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
          Show All Beds
        </button>
        {prebookedBeds.length > 0 && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>
            {prebookedBeds.length} Pre-booked (within ±{windowDays} days)
          </span>
        )}
        {occupiedBeds.length > 0 && forDate <= today() && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>
            {occupiedBeds.length} Occupied now (HIS)
          </span>
        )}
      </div>

      {/* ── Restrictions notice ── */}
      {blockedRoomTypes.size > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <span className="text-amber-700">
            <strong>{blockedRoomTypes.size}</strong> room {blockedRoomTypes.size === 1 ? 'type is' : 'types are'} restricted from booking:
            {' '}<span className="font-semibold">{[...blockedRoomTypes].join(', ')}</span>.
            {' '}<button onClick={() => navigate('/settings', { state: { tab: 'restrictions' } })}
              className="underline font-semibold hover:text-amber-900">Manage restrictions →</button>
          </span>
        </div>
      )}

      {/* ── Suggested Bed Banner (from Available Beds page) ── */}
      {suggestedBed && !suggDismissed && (
        <div className="mb-4 bg-green-50 border-2 border-green-400 rounded-2xl px-4 py-4 flex flex-wrap items-start gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-green-800">
                Suggested Bed from Discharge Queue
                {suggestedBed.isBilled && (
                  <span className="ml-2 text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-bold">Billed & Ready</span>
                )}
              </p>
              <p className="text-xs text-green-700 mt-0.5">
                Bed <span className="font-mono font-black">{suggestedBed.bedNo}</span>
                {' · '}<span className="font-semibold">{suggestedBed.roomType}</span>
                {' · '}{suggestedBed.nurStation}
              </p>
              {suggestedBed.ptName && (
                <p className="text-xs text-green-600 mt-0.5">
                  Currently occupied by <strong>{suggestedBed.ptName}</strong>
                  {suggestedBed.ptNo && <span className="font-mono ml-1 text-green-500">({suggestedBed.ptNo})</span>}
                  {suggestedBed.doctor && <span> · Dr. {suggestedBed.doctor}</span>}
                  {' — '}<span className="font-semibold">{suggestedBed.discStatus}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                const match = allBeds.find(b => b.BED_NO === suggestedBed.bedNo && b.AVAILABLE);
                if (match) {
                  setCardPreview(match);
                } else {
                  setBedSearch(suggestedBed.bedNo);
                  setFilterShow('all');
                }
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm whitespace-nowrap"
            >
              Book This Bed
            </button>
            <button onClick={() => setSuggDismissed(true)}
              className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-100 rounded-lg transition-colors" title="Dismiss">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Success toast ── */}
      {successBed && (
        <div className={`mb-4 border px-4 py-3 rounded-xl flex flex-col gap-1 text-sm font-medium ${displacedInfo ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-green-50 border-green-200 text-green-800'}`}>
          <div className="flex items-center gap-2">
            <svg className={`w-5 h-5 flex-shrink-0 ${displacedInfo ? 'text-amber-500' : 'text-green-500'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span>Bed <strong>{successBed}</strong> pre-booked — patient's requested date: <strong>{dateLabel}</strong>.</span>
            <button onClick={() => navigate('/prebooking-report')} className="underline ml-auto">View in report →</button>
          </div>
          {displacedInfo && (
            <div className="text-xs text-amber-700 pl-7">
              Previous {displacedInfo.priority} booking for <strong>{displacedInfo.patientName}</strong> was displaced to make room for this P1 Emergency booking.
            </div>
          )}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl px-5 py-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Room Type</label>
          <select value={filterRT} onChange={e => setFilterRT(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
            <option value="">All Types</option>
            {roomTypes.map(rt => (
              <option key={rt} value={rt} disabled={blockedRoomTypes.has(rt)}>
                {rt}{blockedRoomTypes.has(rt) ? ' (blocked)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Nursing Station</label>
          <select value={filterNS} onChange={e => setFilterNS(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
            <option value="">All Stations</option>
            {nurStations.map(ns => <option key={ns} value={ns}>{ns}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 w-full sm:flex-1">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Search</label>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
            </svg>
            <input type="text" placeholder="Bed no, room, station…" value={bedSearch}
              onChange={e => setBedSearch(e.target.value)}
              className="pl-9 pr-3 border border-gray-200 rounded-xl py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none w-full"/>
          </div>
        </div>
        {(filterRT || filterNS || bedSearch) && (
          <button onClick={() => { setFilterRT(''); setFilterNS(''); setBedSearch(''); }}
            className="px-4 py-2 text-sm text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors self-end">
            Clear
          </button>
        )}
      </div>

      {availError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{availError}</div>
      )}

      {/* ── Bed grid ── */}
      {availLoading ? (
        <div className="py-24 text-center">
          <svg className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <p className="text-gray-400 text-sm">Checking bed availability for {dateLabel}…</p>
        </div>
      ) : filteredBeds.length === 0 ? (
        <div className="py-24 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
            </svg>
          </div>
          <p className="text-gray-500 font-semibold">No beds match your filters</p>
          <p className="text-gray-400 text-sm mt-1">
            {filterShow === 'available' ? 'Try "Show All Beds" to see occupied/prebooked beds too, or pick a different date.' : 'Try adjusting filters or choosing a different date.'}
          </p>
        </div>
      ) : (
        <>
          {/* Transparent overlay to close card preview on outside click */}
          {cardPreview && (
            <div className="fixed inset-0 z-30" onClick={() => setCardPreview(null)} />
          )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filteredBeds.map(bed => {
            const isAvailable  = bed.AVAILABLE;
            const isOccupied   = bed.OCCUPIED;
            const isPrebooked  = bed.PREBOOKED && !bed.OCCUPIED;
            const isSuggested  = suggestedBed && !suggDismissed && bed.BED_NO === suggestedBed.bedNo;

            let borderColor = '#bbf7d0'; // green
            let dotColor    = '#4ade80';
            let statusLabel = 'Available';
            let statusColor = '#16a34a';
            let subText     = null;

            if (isSuggested && isAvailable) {
              borderColor = '#4ade80';
            } else if (isOccupied) {
              borderColor = '#fecaca'; dotColor = '#f87171';
              statusLabel = 'Occupied'; statusColor = '#dc2626';
            } else if (isPrebooked) {
              borderColor = '#fed7aa'; dotColor = '#fb923c';
              statusLabel = 'Pre-booked'; statusColor = '#ea580c';
              const d = bed.PREBOOKED_DATE ? new Date(bed.PREBOOKED_DATE + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
              subText = `${bed.PREBOOKED_FOR || 'Another patient'}${d ? ` · ${d}` : ''}`;
            }

            const isCardPreviewed = cardPreview?.BED_NO === bed.BED_NO;

            return (
              <div key={bed.BED_NO} className="relative">
                <div
                  onClick={() => isAvailable ? setCardPreview(bed) : null}
                  className={`border-2 rounded-2xl p-4 text-left transition-all ${
                    isSuggested && isAvailable
                      ? 'bg-green-50 cursor-pointer shadow-lg ring-2 ring-green-400 ring-offset-1 hover:-translate-y-0.5 group'
                      : isAvailable
                      ? 'bg-white cursor-pointer hover:border-blue-400 hover:shadow-lg hover:-translate-y-0.5 group'
                      : 'bg-white cursor-not-allowed opacity-70'
                  } ${isCardPreviewed ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                  style={{ borderColor }}
                >
                  {isSuggested && isAvailable && (
                    <div className="text-xs font-black text-green-700 bg-green-200 rounded-lg px-2 py-0.5 mb-2 text-center tracking-wide">
                      ★ SUGGESTED
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: statusColor }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor, boxShadow: isAvailable ? `0 0 0 3px ${dotColor}33` : 'none' }}/>
                      {statusLabel}
                    </span>
                    {isAvailable && (
                      <span className={`text-xs font-bold transition-colors ${isSuggested ? 'text-green-600' : 'text-gray-400 group-hover:text-blue-500'}`}>Book →</span>
                    )}
                  </div>
                  <p className="text-xl font-black text-gray-800 leading-tight mb-1">{bed.BED_NO}</p>
                  <p className="text-xs text-blue-600 font-semibold truncate mb-2">{bed.ROOM_TYPE}</p>
                  <div className="space-y-0.5 pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500 truncate">{bed.NUR_STATION}</p>
                    <p className="text-xs text-gray-400 truncate">Room: {bed.ROOM_NO}</p>
                    {subText && <p className="text-xs text-amber-600 truncate mt-1 font-medium">{subText}</p>}
                  </div>
                </div>

                {/* ── Card quick-preview popup ── */}
                {isCardPreviewed && (() => {
                  const sb = suggestedBed && !suggDismissed && bed.BED_NO === suggestedBed.bedNo ? suggestedBed : null;
                  return (
                    <div className="absolute z-40 left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
                      onClick={e => e.stopPropagation()}>
                      {/* Header */}
                      <div className={`px-4 py-3 flex items-center justify-between ${sb ? 'bg-green-600' : 'bg-blue-600'}`}>
                        <div>
                          <p className="text-white font-black text-sm">{bed.BED_NO}</p>
                          <p className="text-white text-opacity-80 text-xs">{bed.ROOM_TYPE} · {bed.NUR_STATION}</p>
                        </div>
                        <button onClick={() => setCardPreview(null)}
                          className="text-white text-opacity-70 hover:text-opacity-100 p-1 rounded-lg hover:bg-white hover:bg-opacity-20">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>

                      <div className="p-4 space-y-3">
                        {/* Bed details */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-gray-50 rounded-xl px-3 py-2">
                            <p className="text-gray-400 font-semibold">Room No</p>
                            <p className="font-bold text-gray-700 mt-0.5">{bed.ROOM_NO || '—'}</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl px-3 py-2">
                            <p className="text-gray-400 font-semibold">Status</p>
                            <p className="font-bold text-green-600 mt-0.5">Available</p>
                          </div>
                        </div>

                        {/* Discharge suggestion info */}
                        {sb && (
                          <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-xs">
                            <p className="font-black text-green-800 mb-1.5 flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                              </svg>
                              Discharge Queue — {sb.isBilled ? 'Billed & Ready' : sb.discStatus}
                            </p>
                            <p className="text-green-700 font-semibold">{sb.ptName}</p>
                            {sb.ptNo && <p className="font-mono text-green-500">{sb.ptNo}</p>}
                            {sb.doctor && <p className="text-green-600 mt-0.5">Dr. {sb.doctor}</p>}
                          </div>
                        )}

                        {/* Date */}
                        <div className="text-xs text-gray-500 bg-blue-50 rounded-xl px-3 py-2">
                          <span className="font-semibold text-blue-700">Booking for:</span> {dateLabel}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => { setCardPreview(null); handleSelectBed(bed); }}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors shadow-sm ${sb ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {sb ? 'Book This Bed' : 'Proceed to Book'}
                          </button>
                          <button onClick={() => setCardPreview(null)}
                            className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-semibold transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
        </>
      )}

      {/* ══════════════════════ BOOKING FORM MODAL ════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-blue-500 rounded-t-2xl">
              <div>
                <h2 className="text-lg font-black text-white">Pre-Book Bed</h2>
                <p className="text-sm text-blue-100 mt-0.5">
                  <span className="font-mono font-bold">{form.bedNo}</span>
                  {' · '}{form.roomType}{' · '}{form.nurStation}
                </p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-white text-opacity-70 hover:text-opacity-100 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:bg-opacity-20 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* Bed info + planned date */}
              <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-400">Bed No</span><p className="font-mono font-black text-gray-800 mt-0.5">{form.bedNo}</p></div>
                <div><span className="text-gray-400">Room Type</span><p className="font-semibold text-blue-600 mt-0.5">{form.roomType}</p></div>
                <div><span className="text-gray-400">Nursing Station</span><p className="text-gray-700 mt-0.5">{form.nurStation}</p></div>
                <div>
                  <span className="text-gray-400">Patient's Requested Date</span>
                  <p className="font-bold text-gray-800 mt-0.5">{dateLabel}</p>
                </div>
              </div>

              {/* Discharge suggestion notice */}
              {suggestedBed && !suggDismissed && suggestedBed.bedNo === form.bedNo && (
                <div className="bg-green-50 border border-green-300 rounded-xl px-3 py-2.5 text-xs text-green-800 flex items-start gap-2">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <span>
                    This bed is from the <strong>discharge queue</strong> — currently occupied by{' '}
                    <strong>{suggestedBed.ptName || 'a patient'}</strong> with status{' '}
                    <strong>{suggestedBed.discStatus}</strong>.
                    {suggestedBed.isBilled
                      ? ' The bed is billed and ready for a new admission.'
                      : ' The current patient is still in the discharge process — confirm availability before finalising.'}
                  </span>
                </div>
              )}

              {/* Note about window */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700">
                The patient has requested admission on <strong>{dateLabel}</strong>. This bed will be held for them and shown as unavailable to others within ±{windowDays} days of that date, until they are admitted or the booking is cancelled.
              </div>

              {/* HIS lookup */}
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                <label className="block text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">
                  Patient ID — HIS Lookup
                </label>
                <div className="flex gap-2">
                  <input type="text" value={ptNoInput}
                    onChange={e => { setPtNoInput(e.target.value.toUpperCase()); setPtFound(false); setPtLookError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleLookupPatient()}
                    placeholder="e.g. GG00137786"
                    className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                  />
                  <button type="button" onClick={handleLookupPatient} disabled={ptLooking || !ptNoInput.trim()}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                    {ptLooking ? 'Searching…' : 'Fetch'}
                  </button>
                </div>
                {ptLookError && <p className="mt-1.5 text-xs text-red-600">✕ {ptLookError}</p>}
                {ptFound    && <p className="mt-1.5 text-xs text-green-600 font-semibold">✓ Patient details filled from HIS</p>}
              </div>

              {/* Patient name */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Patient Name <span className="text-red-500">*</span></label>
                <input type="text" value={form.patientName}
                  onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))}
                  placeholder="Full name"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Phone <span className="text-red-500">*</span></label>
                  <input type="tel" value={form.patientPhone}
                    onChange={e => setForm(f => ({ ...f, patientPhone: e.target.value }))}
                    placeholder="Mobile number"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Age</label>
                  <input type="number" min="0" max="120" value={form.patientAge}
                    onChange={e => {
                      const age = e.target.value;
                      setForm(f => ({ ...f, patientAge: age }));
                    }}
                    placeholder="Years"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Gender <span className="text-red-500">*</span></label>
                  <select value={form.patientGender} onChange={e => setForm(f => ({ ...f, patientGender: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Doctor Name</label>
                  <input type="text" value={form.doctorName}
                    onChange={e => setForm(f => ({ ...f, doctorName: e.target.value }))}
                    placeholder="Treating doctor"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                  Notes <span className="text-red-500">*</span>
                  <span className="ml-1 text-gray-400 font-normal normal-case">(sent in WhatsApp confirmation)</span>
                </label>
                <textarea rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Diabetic patient, requires ground floor, allergic to penicillin…"
                  required
                  className={`w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none ${!form.notes.trim() ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}
                />
                {!form.notes.trim() && (
                  <p className="text-xs text-red-500 mt-1">This field is required — it will be sent in the patient's WhatsApp confirmation.</p>
                )}
              </div>

              {/* ── Advance Payment ── */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-3">Advance Payment</p>
                <div className="flex items-center gap-3 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div
                      onClick={() => setForm(f => ({ ...f, advanceCollected: !f.advanceCollected, advanceAmount: !f.advanceCollected ? f.advanceAmount : '' }))}
                      className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${form.advanceCollected ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.advanceCollected ? 'translate-x-5' : 'translate-x-0'}`}/>
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      {form.advanceCollected ? '✓ Advance Collected' : 'Advance Collected?'}
                    </span>
                  </label>
                  {form.advanceCollected && (
                    <input type="number" min="0" step="1" value={form.advanceAmount}
                      onChange={e => setForm(f => ({ ...f, advanceAmount: e.target.value }))}
                      placeholder="Amount (₹)"
                      className="border border-green-300 bg-green-50 rounded-xl px-3 py-1.5 text-sm w-36 focus:ring-2 focus:ring-green-400 focus:outline-none font-semibold"/>
                  )}
                </div>
                {form.advanceCollected && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ⚠ This is confirmation only. Please ensure the payment is recorded in the <strong>HIS Patient Advance Module</strong>.
                  </p>
                )}
              </div>

              {/* ── Insurance Status ── */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-3">Insurance Status</p>
                <div className="flex items-center gap-3 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div
                      onClick={() => setForm(f => ({ ...f, isInsured: !f.isInsured, insuranceProvider: !f.isInsured ? f.insuranceProvider : '', insurancePolicyNo: !f.isInsured ? f.insurancePolicyNo : '' }))}
                      className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${form.isInsured ? 'bg-blue-500' : 'bg-gray-300'}`}>
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.isInsured ? 'translate-x-5' : 'translate-x-0'}`}/>
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      {form.isInsured ? '✓ Patient is Insured' : 'Patient is Insured?'}
                    </span>
                  </label>
                </div>
                {form.isInsured && (
                  <div className="space-y-2">
                    <input type="text" placeholder="Insurance Provider" value={form.insuranceProvider}
                      onChange={e => setForm(f => ({ ...f, insuranceProvider: e.target.value }))}
                      className="w-full border border-blue-300 bg-blue-50 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"/>
                    <input type="text" placeholder="Policy No" value={form.insurancePolicyNo}
                      onChange={e => setForm(f => ({ ...f, insurancePolicyNo: e.target.value }))}
                      className="w-full border border-blue-300 bg-blue-50 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"/>
                    <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      ℹ Insurance details will be verified during admission.
                    </p>
                  </div>
                )}
              </div>

              {/* ── Priority Section ── */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-3">Booking Priority</p>

                {/* Priority level selector */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {PRIORITY_OPTIONS.map(opt => {
                    const minForCat = CATEGORY_MIN_PRIORITY[form.priorityCategory] || 'Regular';
                    const isForced  = PRIORITY_RANK[opt.value] > PRIORITY_RANK[minForCat];
                    const isSelected = form.priority === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={isForced}
                        onClick={() => setForm(f => ({ ...f, priority: opt.value }))}
                        className={`text-left rounded-xl px-3 py-2 border-2 transition-all text-xs ${
                          isSelected
                            ? 'border-current shadow-sm'
                            : isForced
                            ? 'opacity-30 cursor-not-allowed border-gray-200'
                            : 'border-gray-200 hover:border-current'
                        }`}
                        style={isSelected ? { borderColor: opt.color, backgroundColor: opt.bg, color: opt.color } : {}}
                      >
                        <p className="font-black">{opt.label}</p>
                        <p className="text-gray-400 mt-0.5 leading-tight" style={isSelected ? { color: opt.color, opacity: 0.8 } : {}}>{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Category + Reason */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Patient Category</label>
                    <select value={form.priorityCategory}
                      onChange={e => {
                        const cat = e.target.value;
                        const minP = CATEGORY_MIN_PRIORITY[cat] || 'Regular';
                        setForm(f => ({
                          ...f,
                          priorityCategory: cat,
                          priority: higherPriority(f.priority, minP),
                        }));
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                      {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Admission Reason</label>
                    <input type="text" value={form.admissionReason}
                      onChange={e => setForm(f => ({ ...f, admissionReason: e.target.value }))}
                      placeholder="Brief clinical note…"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Emergency priority note */}
                {form.priority === 'Emergency' && (
                  <div className="mt-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-xs text-orange-700 font-semibold flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    This is an Emergency admission — will take priority in queue and may displace pre-bookings.
                  </div>
                )}
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-sm">{formError}</div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold rounded-xl hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 transition-all text-sm shadow-sm">
                  {submitting ? 'Booking…' : `Confirm Pre-Booking — ${dateLabel}`}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm">
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

export default BookBed;
