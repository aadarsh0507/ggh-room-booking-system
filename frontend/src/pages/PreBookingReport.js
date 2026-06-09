import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import * as XLSX from 'xlsx';

const ROWS_PER_PAGE = 15;
const todayStr = () => new Date().toISOString().slice(0, 10);

const STATUS_STYLES = {
  Confirmed: 'bg-green-100 text-green-700 border-green-200',
  Cancelled: 'bg-red-100 text-red-700 border-red-200',
  Admitted:  'bg-blue-100 text-blue-700 border-blue-200',
};

const PRIORITY_META = {
  'Emergency': { label: 'Emergency', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', rank: 1 },
  'VIP':       { label: 'VIP',       color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', rank: 2 },
  'Regular':   { label: 'Regular',   color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', rank: 3 },
};

const PRIORITY_OPTIONS = Object.entries(PRIORITY_META).map(([value, m]) => ({ value, ...m }));

const CATEGORY_OPTIONS = ['General', 'Emergency', 'VIP'];

const CATEGORY_MIN_PRIORITY = {
  'Emergency': 'Emergency',
  'VIP':       'VIP',
  'General':   'Regular',
};
const PRIORITY_RANK = { 'Emergency': 1, 'VIP': 2, 'Regular': 3 };
const higherPriority = (a, b) => PRIORITY_RANK[a] <= PRIORITY_RANK[b] ? a : b;

const PriorityBadge = ({ priority, size = 'sm' }) => {
  const m = PRIORITY_META[priority] || PRIORITY_META['Regular'];
  return (
    <span className={`inline-flex items-center font-bold rounded-full border whitespace-nowrap ${size === 'xs' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}
      style={{ color: m.color, backgroundColor: m.bg, borderColor: m.border }}>
      {m.label}
    </span>
  );
};

const PrebookingReport = () => {
  const navigate = useNavigate();

  const [activeTab, setActiveTab]       = useState('bookings'); // 'bookings' | 'whatsapp'

  const [prebookings, setPrebookings]   = useState([]);
  const [listLoading, setListLoading]   = useState(false);
  const [availBeds, setAvailBeds]       = useState([]);

  // WhatsApp logs tab
  const [waLogs,        setWaLogs]        = useState([]);
  const [waTotal,       setWaTotal]       = useState(0);
  const [waLoading,     setWaLoading]     = useState(false);
  const [waPage,        setWaPage]        = useState(1);
  const [waSearch,      setWaSearch]      = useState('');
  const [waStatus,      setWaStatus]      = useState('');
  const [waFrom,        setWaFrom]        = useState('');
  const [waTo,          setWaTo]          = useState('');
  const WA_PAGE_SIZE = 15;

  // Edit booking modal
  const [editTarget,    setEditTarget]    = useState(null);
  const [editForm,      setEditForm]      = useState({});
  const [editSaving,    setEditSaving]    = useState(false);
  const [editBeds,      setEditBeds]      = useState([]);
  const [editBedSearch, setEditBedSearch] = useState('');

  const openEdit = (b) => {
    setEditTarget(b);
    setEditBedSearch('');
    setEditForm({
      bedNo:            b.bedNo || '',
      roomType:         b.roomType || '',
      nurStation:       b.nurStation || '',
      patientId:        b.patientId || '',
      patientName:      b.patientName || '',
      patientPhone:     b.patientPhone || '',
      patientAge:       b.patientAge || '',
      patientGender:    b.patientGender || '',
      doctorName:       b.doctorName || '',
      notes:            b.notes || '',
      bookedDate:       b.bookedDate ? String(b.bookedDate).slice(0, 10) : '',
      admissionReason:  b.admissionReason || '',
      advanceCollected: !!b.advanceCollected,
      advanceAmount:    b.advanceAmount || '',
      isInsured:        !!b.isInsured,
      insuranceProvider: b.insuranceProvider || '',
      insurancePolicyNo: b.insurancePolicyNo || '',
    });
    // Load available beds for the booking date
    const date = b.bookedDate ? String(b.bookedDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
    api.get('/prebooking/available-beds', { params: { forDate: date } })
      .then(r => setEditBeds(r.data.beds || []))
      .catch(() => setEditBeds([]));
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    if (!editForm.patientName.trim()) return alert('Patient name is required');
    if (!editForm.patientGender)      return alert('Gender is required');
    if (!editForm.bookedDate)         return alert('Booked date is required');
    setEditSaving(true);
    try {
      await api.patch(`/prebooking/${editTarget.id}`, editForm);
      setEditTarget(null);
      loadList();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update booking');
    } finally {
      setEditSaving(false);
    }
  };

  const [filterStatus,     setFilterStatus]     = useState('');
  const [filterDateFrom,   setFilterDateFrom]   = useState(todayStr());
  const [filterDateTo,     setFilterDateTo]     = useState('');
  const [filterRoomType,   setFilterRoomType]   = useState('');
  const [filterNurStation, setFilterNurStation] = useState('');
  const [filterPriority,   setFilterPriority]   = useState('');
  const [listSearch,       setListSearch]       = useState('');
  const [listPage,         setListPage]         = useState(1);

  // Escalate priority modal
  const [escalateTarget, setEscalateTarget]   = useState(null); // booking row
  const [escalatePriority, setEscalatePriority] = useState('');
  const [escalateCategory, setEscalateCategory] = useState('');
  const [escalateReason,   setEscalateReason]   = useState('');
  const [escalating,       setEscalating]       = useState(false);

  const [syncStatus,    setSyncStatus]    = useState(null); // { lastSyncTime, lastSyncCount }
  const [syncing,       setSyncing]       = useState(false);
  const syncIntervalRef = useRef(null);
  const loadListRef     = useRef(null); // forward-ref so runSync can call loadList

  const fetchSyncStatus = useCallback(() => {
    api.get('/prebooking/sync-status')
      .then(r => setSyncStatus(r.data))
      .catch(() => {});
  }, []);

  const runSync = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    try {
      // Sync HIS bed & room details for all admitted patients
      await api.post('/dashboard/sync-his-beds');
      // Reload the prebookings list to show updated HIS data
      if (loadListRef.current) loadListRef.current();
      if (!silent) setSyncStatus({ lastSyncTime: new Date().toISOString() });
    } catch (err) {
      console.error('[Sync] Error:', err.message);
    } finally {
      if (!silent) setSyncing(false);
    }
  }, []);

  const loadAvailBeds = useCallback(() => {
    api.get('/prebooking/available-beds')
      .then(r => setAvailBeds(r.data.beds))
      .catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    setListLoading(true);
    const params = {};
    if (filterStatus)     params.status           = filterStatus;
    if (filterDateFrom)   params.dateFrom         = filterDateFrom;
    if (filterDateTo)     params.dateTo           = filterDateTo;
    if (filterRoomType)   params.roomType         = filterRoomType;
    if (filterNurStation) params.nurStation       = filterNurStation;
    if (filterPriority)   params.priority         = filterPriority;
    api.get('/prebooking', { params })
      .then(r => { setPrebookings(r.data.prebookings); setListPage(1); })
      .catch(() => {})
      .finally(() => setListLoading(false));
  }, [filterStatus, filterDateFrom, filterDateTo, filterRoomType, filterNurStation, filterPriority]);

  const loadWaLogs = useCallback((page = 1) => {
    setWaLoading(true);
    const params = { limit: WA_PAGE_SIZE, offset: (page - 1) * WA_PAGE_SIZE };
    if (waSearch) params.search   = waSearch;
    if (waStatus) params.status   = waStatus;
    if (waFrom)   params.fromDate = waFrom;
    if (waTo)     params.toDate   = waTo;
    api.get('/prebooking/whatsapp-logs', { params })
      .then(r => { setWaLogs(r.data.logs); setWaTotal(r.data.total); setWaPage(page); })
      .catch(() => {})
      .finally(() => setWaLoading(false));
  }, [waSearch, waStatus, waFrom, waTo]);

  // Keep ref up-to-date so runSync can call the latest loadList
  useEffect(() => { loadListRef.current = loadList; }, [loadList]);

  useEffect(() => { loadAvailBeds(); }, [loadAvailBeds]);
  useEffect(() => { loadList(); }, [loadList]);

  // On mount: fetch current sync status then run sync; poll every 2 min
  useEffect(() => {
    fetchSyncStatus();
    runSync(true);
    syncIntervalRef.current = setInterval(() => runSync(true), 2 * 60 * 1000);
    return () => clearInterval(syncIntervalRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (activeTab === 'whatsapp') loadWaLogs(1); }, [activeTab, loadWaLogs]);

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this prebooking?')) return;
    await api.patch(`/prebooking/${id}/cancel`);
    loadList();
  };

  const handleAdmit = async (id) => {
    if (!window.confirm('Mark this patient as admitted?')) return;
    await api.patch(`/prebooking/${id}/admit`);
    loadList();
  };

  const reportRoomTypes   = [...new Set(availBeds.map(b => b.ROOM_TYPE).filter(Boolean))].sort();
  const reportNurStations = [...new Set(availBeds.map(b => b.NUR_STATION).filter(Boolean))].sort();

  const filteredList = prebookings.filter(b => {
    if (!listSearch) return true;
    const s = listSearch.toLowerCase();
    return (b.patientName || '').toLowerCase().includes(s) ||
           (b.bedNo       || '').toLowerCase().includes(s) ||
           (b.doctorName  || '').toLowerCase().includes(s) ||
           (b.bookedBy    || '').toLowerCase().includes(s);
  });

  const totalPages      = Math.ceil(filteredList.length / ROWS_PER_PAGE);
  const summaryTotal     = prebookings.length;
  const summaryConfirmed = prebookings.filter(b => b.status === 'Confirmed').length;
  const summaryCancelled = prebookings.filter(b => b.status === 'Cancelled').length;
  const summaryAdmitted  = prebookings.filter(b => b.status === 'Admitted').length;
  const todayDate        = new Date().toISOString().slice(0, 10);
  const summaryUpcoming  = prebookings.filter(b => b.status === 'Confirmed' && String(b.bookedDate).slice(0, 10) > todayDate).length;

  // Priority alert counts — only Confirmed bookings
  const confirmedOnly = prebookings.filter(b => b.status === 'Confirmed');
  const urgentAlerts  = confirmedOnly.filter(b => b.priority === 'Emergency');

  const handleEscalate = async () => {
    if (!escalateTarget || !escalatePriority) return;
    setEscalating(true);
    try {
      await api.patch(`/prebooking/${escalateTarget.id}/priority`, {
        priority: escalatePriority,
        priorityCategory: escalateCategory || escalateTarget.priorityCategory,
        admissionReason: escalateReason || escalateTarget.admissionReason,
      });
      setEscalateTarget(null);
      loadList();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update priority');
    } finally {
      setEscalating(false);
    }
  };

  const openEscalate = (b) => {
    setEscalateTarget(b);
    setEscalatePriority(b.priority || 'P4-Routine');
    setEscalateCategory(b.priorityCategory || 'General');
    setEscalateReason(b.admissionReason || '');
  };

  const clearAll = () => {
    setFilterDateFrom(todayStr()); setFilterDateTo(''); setFilterStatus('');
    setFilterRoomType(''); setFilterNurStation(''); setFilterPriority('');
    setListSearch(''); setListPage(1);
  };

  // ── Export helpers ────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ['Patient ID','Patient','Mobile','Bed No','Room Type','Doctor','Notes','Insurance','Insurance Provider','Policy No','Priority','Booked By','Bed Booked Date','Booked At (System)','Advance Collected','Advance Amount','Actual Bed (HIS)','Actual Room (HIS)','Status','Cancelled By','Admitted By'];
    const rows = filteredList.map((b) => [
      b.patientId || '',
      b.patientName || '',
      b.patientPhone || '',
      b.bedNo || '',
      b.roomType || '',
      b.doctorName || '',
      b.notes || '',
      b.isInsured ? 'Yes' : 'No',
      b.insuranceProvider || '',
      b.insurancePolicyNo || '',
      b.priority || '',
      b.bookedUserName || b.bookedBy || 'System',
      b.bookedDate ? String(b.bookedDate).slice(0, 10) : '',
      b.createdAt ? new Date(b.createdAt).toLocaleString('en-IN') : '',
      b.advanceCollected ? 'Yes' : 'No',
      b.advanceAmount || '',
      b.hisBed || '',
      b.hisRoom || '',
      b.hisAdmissionDate ? new Date(b.hisAdmissionDate).toLocaleString('en-GB') : '',
      b.status || '',
      b.cancelledBy || '',
      b.admittedBy || '',
    ]);

    // Create workbook and worksheet
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pre-Bookings');

    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Patient ID
      { wch: 20 }, // Patient
      { wch: 15 }, // Mobile
      { wch: 15 }, // Bed
      { wch: 15 }, // Room Type
      { wch: 15 }, // Doctor
      { wch: 20 }, // Notes
      { wch: 12 }, // Insurance
      { wch: 18 }, // Insurance Provider
      { wch: 15 }, // Policy No
      { wch: 12 }, // Priority
      { wch: 15 }, // Booked By
      { wch: 12 }, // Bed Booked Date
      { wch: 15 }, // Advance Collected
      { wch: 15 }, // Advance Amount
      { wch: 15 }, // HIS Live Bed
      { wch: 15 }, // HIS Live Room
      { wch: 18 }, // HIS Admission Date
      { wch: 12 }, // Status
      { wch: 15 }, // Cancelled By
      { wch: 15 }, // Admitted By
    ];

    // Generate filename with date
    const filename = `prebooking-report-${new Date().toISOString().slice(0,10)}.xlsx`;

    // Write file
    XLSX.writeFile(wb, filename);
  };

  const exportPDF = () => {
    const printWindow = window.open('', '_blank');
    const rows = filteredList.map((b, i) => `
      <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
        <td><strong>${b.patientName||''}</strong></td>
        <td style="font-weight:700;color:#2563eb">${b.patientId||'—'}</td>
        <td style="font-family:monospace;font-size:11px">${b.patientPhone||'—'}</td>
        <td><strong>${b.bedNo||''}</strong></td>
        <td>${b.roomType||''}</td>
        <td>${b.doctorName||'—'}</td>
        <td style="font-size:10px;max-width:100px;overflow:hidden;text-overflow:ellipsis">${b.notes||'—'}</td>
        <td style="font-size:10px">${b.isInsured?`✓ ${b.insuranceProvider||'Insured'}`:'—'}</td>
        <td style="font-size:10px">${b.insurancePolicyNo||'—'}</td>
        <td><span style="background:${PRIORITY_META[b.priority]?.bg||'#eff6ff'};color:${PRIORITY_META[b.priority]?.color||'#2563eb'};padding:2px 8px;border-radius:20px;font-weight:700;font-size:11px">${b.priority||''}</span></td>
        <td style="font-size:10px">${b.bookedUserName||b.bookedBy||'System'}</td>
        <td style="font-weight:700">${b.bookedDate ? String(b.bookedDate).slice(0,10) : '—'}</td>
        <td style="font-size:10px;color:#374151">${b.createdAt ? new Date(b.createdAt).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}) : '—'}</td>
        <td>${b.advanceCollected?`<span style="color:#16a34a;font-weight:700">✓ ₹${Number(b.advanceAmount||0).toLocaleString('en-IN')}</span>`:'—'}</td>
        <td style="font-weight:700;color:#059669">${b.hisBed||'—'}</td>
        <td>${b.hisRoom||'—'}</td>
        <td style="font-size:10px;color:#7c3aed">${b.hisAdmissionDate ? new Date(b.hisAdmissionDate).toLocaleString('en-GB', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
        <td><span style="padding:2px 8px;border-radius:20px;font-weight:700;font-size:11px;background:${b.status==='Confirmed'?'#dcfce7':b.status==='Admitted'?'#dbeafe':'#fee2e2'};color:${b.status==='Confirmed'?'#166534':b.status==='Admitted'?'#1d4ed8':'#991b1b'}">${b.status||''}</span></td>
      </tr>`).join('');

    printWindow.document.write(`<!DOCTYPE html><html><head>
      <title>Pre-Booking Report — ${new Date().toLocaleDateString('en-IN')}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #111; }
        h2 { color: #1d4ed8; margin-bottom: 4px; }
        p { color: #6b7280; margin: 0 0 16px; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1d4ed8; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; white-space: nowrap; }
        td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
        @media print { body { margin: 10px; } }
      </style>
    </head><body>
      <h2>GG Hospital — Pre-Booking Report</h2>
      <p>Generated: ${new Date().toLocaleString('en-IN')} &nbsp;|&nbsp; Total: ${filteredList.length} records</p>
      <table>
        <thead><tr>
          <th>Patient</th><th>Patient ID</th><th>Mobile</th><th>Bed No</th><th>Room Type</th><th>Doctor</th><th>Notes</th><th>Insurance</th><th>Policy No</th><th>Priority</th><th>Booked By</th><th>Bed Booked Date</th><th>Booked At (System)</th><th>Advance</th><th>Actual Bed (HIS)</th><th>Actual Room (HIS)</th><th>Admitted At (HIS)</th><th>Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`);
    printWindow.document.close();
  };

  return (
    <Layout title="Pre-Booking Report">
      {/* ── Top action bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-black text-gray-800">Pre-Booking Report</h2>
          <p className="text-xs text-gray-400 mt-0.5">Manage and track all bed pre-bookings</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => runSync(false)}
            disabled={syncing}
            className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 rounded-xl px-4 py-2.5 shadow-sm transition-all text-sm font-semibold disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
          {activeTab === 'bookings' && (
            <>
              <button onClick={exportCSV}
                className="flex items-center gap-1.5 border border-green-300 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl px-4 py-2.5 shadow-sm transition-all text-sm font-semibold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"/>
                </svg>
                Excel
              </button>
              <button onClick={exportPDF}
                className="flex items-center gap-1.5 border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl px-4 py-2.5 shadow-sm transition-all text-sm font-semibold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                </svg>
                PDF
              </button>
            </>
          )}
          <button
            onClick={() => navigate('/book-bed')}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl px-5 py-2.5 shadow-sm transition-all text-sm font-bold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            New Booking
          </button>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setActiveTab('bookings')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'bookings' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
          📋 Bookings
        </button>
        <button onClick={() => setActiveTab('whatsapp')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'whatsapp' ? 'bg-white shadow text-green-700' : 'text-gray-500 hover:text-gray-700'}`}>
          💬 WhatsApp Logs
        </button>
      </div>

      {activeTab === 'whatsapp' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* WA log filters */}
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">From</label>
              <input type="date" value={waFrom} onChange={e => setWaFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 focus:outline-none"/>
            </div>
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">To</label>
              <input type="date" value={waTo} onChange={e => setWaTo(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 focus:outline-none"/>
            </div>
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Status</label>
              <select value={waStatus} onChange={e => setWaStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-green-400 focus:outline-none">
                <option value="">All</option>
                <option value="Sent">Sent</option>
                <option value="Failed">Failed</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 w-full sm:flex-1">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Search</label>
              <input type="text" placeholder="Patient, phone, bed…" value={waSearch} onChange={e => setWaSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 focus:outline-none"/>
            </div>
            <button onClick={() => loadWaLogs(1)}
              className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-colors">
              Apply
            </button>
            <button onClick={() => { setWaSearch(''); setWaStatus(''); setWaFrom(''); setWaTo(''); setTimeout(() => loadWaLogs(1), 0); }}
              className="px-4 py-2 border border-gray-200 text-gray-500 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
              Clear
            </button>
          </div>

          {/* WA summary counts */}
          <div className="px-5 py-3 border-b border-gray-100 flex gap-4 text-sm">
            <span className="font-semibold text-gray-700">Total: <span className="text-gray-900">{waTotal}</span></span>
            <span className="font-semibold text-green-600">Sent: <span className="text-green-700">{waLogs.filter(l => l.status === 'Sent').length}</span></span>
            <span className="font-semibold text-red-500">Failed: <span className="text-red-600">{waLogs.filter(l => l.status === 'Failed').length}</span></span>
          </div>

          {waLoading ? (
            <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
          ) : waLogs.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No WhatsApp logs found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['#','Patient','Phone','Bed','Status','Message','Sent At','Error'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-50">
                  {waLogs.map((l, i) => (
                    <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 text-gray-400 text-xs">{(waPage - 1) * WA_PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{l.patientName}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">{l.phone}</td>
                      <td className="px-3 py-2.5 font-mono font-black text-gray-800 whitespace-nowrap">{l.bedNo}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${l.status === 'Sent' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                          {l.status === 'Sent' ? '✓' : '✗'} {l.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[260px] truncate" title={l.message}>{l.message}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{new Date(l.sentAt).toLocaleString('en-GB')}</td>
                      <td className="px-3 py-2.5 text-xs text-red-500 max-w-[180px] truncate" title={l.errorMsg || ''}>{l.errorMsg || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* WA pagination */}
          {Math.ceil(waTotal / WA_PAGE_SIZE) > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-2xl">
              <span className="text-sm text-gray-500">Page <strong>{waPage}</strong> of <strong>{Math.ceil(waTotal / WA_PAGE_SIZE)}</strong></span>
              <div className="flex gap-2">
                <button onClick={() => loadWaLogs(waPage - 1)} disabled={waPage === 1}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">← Prev</button>
                <button onClick={() => loadWaLogs(waPage + 1)} disabled={waPage >= Math.ceil(waTotal / WA_PAGE_SIZE)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">Next →</button>
              </div>
            </div>
          )}
        </div>
      ) : (
      <>{/* ── HIS Manual Sync status strip ── */}
      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-sm">
        <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" style={{ boxShadow: '0 0 0 3px #dbeafe' }}/>
        <span className="text-blue-700 font-semibold">HIS Integration Active</span>
        <span className="text-blue-600 text-xs ml-1">· Live patient bed and room data from HIS is displayed. Use "Sync Now" button to refresh HIS data.</span>
        {syncStatus?.lastSyncTime && (
          <span className="ml-auto text-xs text-blue-600 shrink-0 whitespace-nowrap">
            Last synced: {new Date(syncStatus.lastSyncTime).toLocaleTimeString('en-GB')}
          </span>
        )}
      </div>

      {/* ── P1/P2 urgent alert strip ── */}
      {urgentAlerts.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-300 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0"/>
            <span className="text-red-700 font-black text-sm">
              {urgentAlerts.length} Emergency bookings awaiting admission
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 ml-2">
            {urgentAlerts.slice(0, 5).map(b => (
              <span key={b.id} className="text-xs px-2 py-1 rounded-full font-semibold"
                style={{ backgroundColor: PRIORITY_META[b.priority]?.bg, color: PRIORITY_META[b.priority]?.color, border: `1px solid ${PRIORITY_META[b.priority]?.border}` }}>
                {b.bedNo} — {b.patientName}
              </span>
            ))}
            {urgentAlerts.length > 5 && <span className="text-xs text-red-500 font-semibold self-center">+{urgentAlerts.length - 5} more</span>}
          </div>
          <button onClick={() => { setFilterPriority('Emergency'); setFilterStatus('Confirmed'); setListPage(1); }}
            className="ml-auto text-xs font-bold text-red-600 underline hover:text-red-800">
            Show Emergency only →
          </button>
        </div>
      )}

      {/* ── Summary KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Total',     value: summaryTotal,     gradient: 'from-slate-600 to-slate-800',     filter: '' },
          { label: 'Confirmed', value: summaryConfirmed, gradient: 'from-emerald-500 to-emerald-700', filter: 'Confirmed' },
          { label: 'Admitted',  value: summaryAdmitted,  gradient: 'from-blue-500 to-indigo-700',     filter: 'Admitted' },
          { label: 'Cancelled', value: summaryCancelled, gradient: 'from-red-500 to-rose-700',        filter: 'Cancelled' },
          { label: 'Upcoming',  value: summaryUpcoming,  gradient: 'from-violet-500 to-purple-700',   filter: 'Confirmed' },
        ].map(c => (
          <button
            key={c.label}
            onClick={() => {
              const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
              setFilterStatus(c.filter);
              if (c.label === 'Total') {
                // All from today onwards — no end limit
                setFilterDateFrom(todayStr()); setFilterDateTo('');
              } else if (c.label === 'Confirmed') {
                // Confirmed from today onwards
                setFilterDateFrom(todayStr()); setFilterDateTo('');
              } else if (c.label === 'Admitted') {
                // Admitted — today only (already admitted today)
                setFilterDateFrom(todayStr()); setFilterDateTo(todayStr());
              } else if (c.label === 'Cancelled') {
                // Cancelled — today only
                setFilterDateFrom(todayStr()); setFilterDateTo(todayStr());
              } else if (c.label === 'Upcoming') {
                // Future bookings only — from tomorrow, no end limit
                setFilterDateFrom(tomorrow); setFilterDateTo('');
              }
              setListPage(1);
            }}
            className={`bg-gradient-to-br ${c.gradient} rounded-2xl px-5 py-4 text-left text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg`}
          >
            <p className="text-xs font-semibold text-white text-opacity-80 uppercase tracking-wide">{c.label}</p>
            <p className="text-3xl font-black mt-1">{c.value}</p>
            {c.label === 'Upcoming'  && <p className="text-xs text-white text-opacity-60 mt-0.5">Future dates</p>}
            {c.label === 'Confirmed' && <p className="text-xs text-white text-opacity-60 mt-0.5">Today onwards</p>}
            {c.label === 'Total'     && <p className="text-xs text-white text-opacity-60 mt-0.5">Today onwards</p>}
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl px-5 py-4 mb-4">

        {/* Quick date shortcuts */}
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { label: 'Today',      from: todayStr(), to: todayStr() },
            { label: 'Tomorrow',   from: (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); })(), to: (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); })() },
            { label: 'This Week',  from: (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0,10); })(), to: (() => { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return d.toISOString().slice(0,10); })() },
            { label: 'This Month', from: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10); })(), to: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10); })() },
            { label: 'All',        from: '', to: '' },
          ].map(q => {
            const isActive = filterDateFrom === q.from && filterDateTo === q.to;
            return (
              <button key={q.label}
                onClick={() => { setFilterDateFrom(q.from); setFilterDateTo(q.to); setListPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
                }`}>
                {q.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">From Date</label>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"/>
          </div>
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">To Date</label>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"/>
          </div>
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <option value="">All Status</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Admitted">Admitted</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Room Type</label>
            <select value={filterRoomType} onChange={e => setFilterRoomType(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <option value="">All Types</option>
              {reportRoomTypes.map(rt => <option key={rt} value={rt}>{rt}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Nursing Station</label>
            <select value={filterNurStation} onChange={e => setFilterNurStation(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <option value="">All Stations</option>
              {reportNurStations.map(ns => <option key={ns} value={ns}>{ns}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Priority</label>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <option value="">All Priorities</option>
              {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <button onClick={() => { loadList(); setListPage(1); }} disabled={listLoading}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors self-end shadow-sm">
            {listLoading ? 'Loading…' : 'Apply'}
          </button>
          <button onClick={clearAll}
            className="px-5 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors self-end">
            Clear
          </button>
          <div className="w-full sm:flex-1 flex flex-col gap-1 self-end">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
              </svg>
              <input type="text" placeholder="Search patient, bed, doctor…" value={listSearch}
                onChange={e => { setListSearch(e.target.value); setListPage(1); }}
                className="w-full pl-9 pr-3 border border-gray-200 rounded-xl py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"/>
            </div>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl overflow-hidden">
        {listLoading ? (
          <div className="py-20 text-center">
            <svg className="w-7 h-7 animate-spin mx-auto mb-3 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <p className="text-gray-400 text-sm">Loading report…</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Patient','Patient ID','Mobile','Bed No','Doctor','Notes','Insurance','Priority','Booked By','Bed Booked Date','Booked At (System)','Advance','Actual Bed (HIS)','Actual Room (HIS)','Admitted At (HIS)','Status','Actions'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
                {filteredList.length === 0 ? (
                  <tr><td colSpan={14} className="px-4 py-16 text-center text-gray-400 text-sm">
                    No records found.
                  </td></tr>
                ) : filteredList.slice((listPage - 1) * ROWS_PER_PAGE, listPage * ROWS_PER_PAGE).map((b, i) => {
                  const isUrgent = b.priority === 'Emergency';
                  const rowBg = b.status === 'Confirmed' && isUrgent
                    ? PRIORITY_META[b.priority]?.bg
                    : undefined;
                  return (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors" style={rowBg ? { backgroundColor: rowBg } : {}}>
                    <td className="px-3 py-3 font-semibold">
                      <div className="flex flex-col gap-0.5">
                        <p className="font-bold text-gray-900 text-sm">{b.patientName || '—'}</p>
                        <p className="text-xs text-gray-500">{b.patientGender || '—'} · {b.bedNo || '—'} ({b.roomType || '—'})</p>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono font-bold text-blue-700 text-sm">
                      {b.patientId ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200">
                          {b.patientId}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-sm text-gray-700">{b.patientPhone || '—'}</td>
                    <td className="px-3 py-3 font-mono font-black text-gray-800">{b.bedNo || '—'}</td>
                    <td className="px-3 py-3 text-gray-600 text-xs max-w-[120px] truncate" title={b.doctorName}>{b.doctorName || '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-600 max-w-[150px] truncate" title={b.notes}>{b.notes || '—'}</td>
                    <td className="px-3 py-3">
                      {b.isInsured ? (
                        <div className="flex flex-col text-xs gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold w-fit">
                            ✓ Insured
                          </span>
                          {(b.insuranceProvider || b.insurancePolicyNo) && (
                            <span className="text-gray-600 font-semibold text-xs max-w-[130px] truncate" title={`${b.insuranceProvider || ''} · ${b.insurancePolicyNo || ''}`}>
                              {b.insuranceProvider && b.insurancePolicyNo ? `${b.insuranceProvider} · ${b.insurancePolicyNo}` : b.insuranceProvider || b.insurancePolicyNo}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs font-semibold">Not Insured</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <PriorityBadge priority={b.priority || 'Regular'} size="xs"/>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200">
                        <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                        <span className="font-semibold text-blue-700">{b.bookedUserName || b.bookedBy || 'System'}</span>
                      </div>
                    </td>
                    {/* Bed Booked Date — planned admission date chosen by staff */}
                    <td className="px-3 py-3 text-xs">
                      {b.bookedDate ? (() => {
                        const [y, m, d] = String(b.bookedDate).slice(0, 10).split('-').map(Number);
                        return <p className="font-bold text-gray-800">{new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>;
                      })() : <span className="text-gray-300">—</span>}
                    </td>
                    {/* Booked At — when staff registered it in this system */}
                    <td className="px-3 py-3 text-xs">
                      {b.createdAt ? (() => {
                        const d = new Date(b.createdAt);
                        return (
                          <div>
                            <p className="font-semibold text-gray-700">{d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                            <p className="text-blue-500 font-mono">{d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</p>
                          </div>
                        );
                      })() : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {b.advanceCollected ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-bold">
                          ✓ {b.advanceAmount ? `₹${Number(b.advanceAmount).toLocaleString('en-IN')}` : 'Collected'}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono font-black text-gray-800">
                      {b.hisBed ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs">
                          ✓ {b.hisBed}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {b.hisRoom ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                          {b.hisRoom}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    {/* Admitted At (HIS) — actual admission date+time from HIS */}
                    <td className="px-3 py-3 text-xs">
                      {b.hisAdmissionDate ? (() => {
                        const d = new Date(b.hisAdmissionDate);
                        return (
                          <div>
                            <p className="font-semibold text-purple-700">{d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                            <p className="text-purple-400 font-mono">{d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                          </div>
                        );
                      })() : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${STATUS_STYLES[b.status]}`}>
                        {b.status}
                      </span>
                      {b.status === 'Cancelled' && b.cancelledBy && (
                        <div className="text-xs text-gray-400 mt-0.5">by {b.cancelledBy}</div>
                      )}
                      {b.status === 'Admitted' && b.admittedBy && (
                        <div className={`text-xs mt-0.5 flex items-center gap-1 ${b.admittedBy === 'HIS-Auto' ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
                          {b.admittedBy === 'HIS-Auto' && (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                          )}
                          {b.admittedBy === 'HIS-Auto' ? 'Auto (HIS)' : `by ${b.admittedBy}`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {b.status === 'Confirmed' && (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-1.5">
                            <button onClick={() => handleAdmit(b.id)}
                              className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">
                              Admit
                            </button>
                            <button onClick={() => handleCancel(b.id)}
                              className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors">
                              Cancel
                            </button>
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={() => openEscalate(b)}
                              className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors flex-1">
                              ↑ Priority
                            </button>
                            <button onClick={() => openEdit(b)}
                              className="px-2.5 py-1 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-100 transition-colors flex-1">
                              ✏ Edit
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!listLoading && totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-2xl">
            <span className="text-sm text-gray-500">
              {filteredList.length} records · Page <strong>{listPage}</strong> of <strong>{totalPages}</strong>
            </span>
            <div className="flex gap-2">
              <button onClick={() => setListPage(p => Math.max(1, p - 1))} disabled={listPage === 1}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">
                Previous
              </button>
              <button onClick={() => setListPage(p => Math.min(totalPages, p + 1))} disabled={listPage === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Escalate Priority Modal ── */}
      {escalateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-500 to-orange-500 rounded-t-2xl">
              <div>
                <h2 className="text-lg font-black text-white">Update Priority</h2>
                <p className="text-sm text-amber-100 mt-0.5">
                  {escalateTarget.patientName} — Bed {escalateTarget.bedNo}
                </p>
              </div>
              <button onClick={() => setEscalateTarget(null)} className="text-white text-opacity-70 hover:text-opacity-100 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:bg-opacity-20 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 text-xs grid grid-cols-2 gap-2">
                <div><span className="text-gray-400">Current Priority</span>
                  <div className="mt-1"><PriorityBadge priority={escalateTarget.priority || 'Regular'}/></div>
                </div>
                <div><span className="text-gray-400">Category</span>
                  <p className="font-semibold text-gray-700 mt-1">{escalateTarget.priorityCategory || 'General'}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">New Priority Level</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRIORITY_OPTIONS.map(opt => {
                    const minForCat = CATEGORY_MIN_PRIORITY[escalateCategory] || 'Regular';
                    const isForced = PRIORITY_RANK[opt.value] > PRIORITY_RANK[minForCat];
                    const isSelected = escalatePriority === opt.value;
                    return (
                      <button key={opt.value} type="button"
                        disabled={isForced}
                        onClick={() => setEscalatePriority(opt.value)}
                        className={`text-left rounded-xl px-3 py-2 border-2 transition-all text-xs ${isSelected ? 'shadow-sm' : isForced ? 'opacity-30 cursor-not-allowed border-gray-200' : 'border-gray-200 hover:border-current'}`}
                        style={isSelected ? { borderColor: opt.color, backgroundColor: opt.bg, color: opt.color } : {}}>
                        <p className="font-black">{opt.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Patient Category</label>
                  <select value={escalateCategory}
                    onChange={e => {
                      const cat = e.target.value;
                      const minP = CATEGORY_MIN_PRIORITY[cat] || 'Regular';
                      setEscalateCategory(cat);
                      setEscalatePriority(higherPriority(escalatePriority, minP));
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-amber-400 focus:outline-none">
                    {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Reason / Note</label>
                  <input type="text" value={escalateReason} onChange={e => setEscalateReason(e.target.value)}
                    placeholder="Clinical note…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"/>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={handleEscalate} disabled={escalating}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 transition-all text-sm shadow-sm">
                  {escalating ? 'Updating…' : 'Save Priority'}
                </button>
                <button onClick={() => setEscalateTarget(null)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Edit Booking Modal ── */}
      {editTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-t-2xl px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-white">Edit Booking</h2>
                <p className="text-sm text-gray-300 mt-0.5">
                  {editForm.bedNo !== editTarget.bedNo
                    ? <><span className="line-through opacity-50">{editTarget.bedNo}</span> → <span className="text-green-300 font-bold">{editForm.bedNo}</span></>
                    : <>{editForm.bedNo} · {editForm.roomType}</>
                  }
                </p>
              </div>
              <button onClick={() => setEditTarget(null)} className="text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:bg-opacity-20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">

              {/* Bed / Room selector */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Bed / Room</label>
                <div className="relative">
                  <input type="text"
                    value={editBedSearch || (editForm.bedNo !== editTarget.bedNo ? `${editForm.bedNo} — ${editForm.roomType}` : '')}
                    onChange={e => setEditBedSearch(e.target.value)}
                    onFocus={e => { setEditBedSearch(''); e.target.select(); }}
                    placeholder={`Current: ${editTarget.bedNo} · ${editTarget.roomType} — type to change`}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"/>
                  {editBedSearch.trim() && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {editBeds
                        .filter(b => {
                          const q = editBedSearch.toLowerCase();
                          return b.BED_NO.toLowerCase().includes(q) || (b.ROOM_TYPE||'').toLowerCase().includes(q) || (b.NUR_STATION||'').toLowerCase().includes(q);
                        })
                        .slice(0, 20)
                        .map(b => (
                          <button key={b.BED_NO} type="button"
                            onClick={() => {
                              setEditForm(f => ({ ...f, bedNo: b.BED_NO, roomType: b.ROOM_TYPE || '', nurStation: b.NUR_STATION || '' }));
                              setEditBedSearch('');
                            }}
                            className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-0 ${editForm.bedNo === b.BED_NO ? 'bg-blue-50 font-bold text-blue-700' : ''}`}>
                            <span className="font-mono font-bold text-gray-800">{b.BED_NO}</span>
                            <span className="ml-2 text-xs text-purple-600">{b.ROOM_TYPE}</span>
                            <span className="ml-2 text-xs text-gray-400">{b.NUR_STATION}</span>
                          </button>
                        ))}
                      {editBeds.filter(b => {
                        const q = editBedSearch.toLowerCase();
                        return b.BED_NO.toLowerCase().includes(q) || (b.ROOM_TYPE||'').toLowerCase().includes(q);
                      }).length === 0 && (
                        <div className="px-4 py-3 text-xs text-gray-400">No available beds match "{editBedSearch}"</div>
                      )}
                    </div>
                  )}
                </div>
                {editForm.bedNo !== editTarget.bedNo && (
                  <p className="text-xs text-green-600 mt-1 font-semibold">
                    ✓ Bed changed to {editForm.bedNo} · {editForm.roomType} · {editForm.nurStation}
                    <button onClick={() => setEditForm(f => ({ ...f, bedNo: editTarget.bedNo, roomType: editTarget.roomType, nurStation: editTarget.nurStation }))}
                      className="ml-2 text-red-400 hover:text-red-600 underline">undo</button>
                  </p>
                )}
              </div>

              {/* Patient Name */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Patient Name <span className="text-red-500">*</span></label>
                <input type="text" value={editForm.patientName}
                  onChange={e => setEditForm(f => ({ ...f, patientName: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"/>
              </div>

              {/* Phone + Age */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Phone</label>
                  <input type="tel" value={editForm.patientPhone}
                    onChange={e => setEditForm(f => ({ ...f, patientPhone: e.target.value }))}
                    placeholder="Mobile number"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Age</label>
                  <input type="number" min="0" max="120" value={editForm.patientAge}
                    onChange={e => setEditForm(f => ({ ...f, patientAge: e.target.value }))}
                    placeholder="Years"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"/>
                </div>
              </div>

              {/* Gender + Doctor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Gender <span className="text-red-500">*</span></label>
                  <select value={editForm.patientGender}
                    onChange={e => setEditForm(f => ({ ...f, patientGender: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Doctor</label>
                  <input type="text" value={editForm.doctorName}
                    onChange={e => setEditForm(f => ({ ...f, doctorName: e.target.value }))}
                    placeholder="Treating doctor"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"/>
                </div>
              </div>

              {/* Admission Date */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Admission Date <span className="text-red-500">*</span></label>
                <input type="date" value={editForm.bookedDate}
                  onChange={e => {
                    const d = e.target.value;
                    setEditForm(f => ({ ...f, bookedDate: d }));
                    if (d) api.get('/prebooking/available-beds', { params: { forDate: d } })
                      .then(r => setEditBeds(r.data.beds || [])).catch(() => {});
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"/>
              </div>

              {/* Notes + Admission Reason */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                  <textarea rows={2} value={editForm.notes}
                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Special requirements…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Admission Reason</label>
                  <textarea rows={2} value={editForm.admissionReason}
                    onChange={e => setEditForm(f => ({ ...f, admissionReason: e.target.value }))}
                    placeholder="Clinical note…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"/>
                </div>
              </div>

              {/* Advance Payment */}
              <div className="border-t border-gray-100 pt-3">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <div onClick={() => setEditForm(f => ({ ...f, advanceCollected: !f.advanceCollected, advanceAmount: !f.advanceCollected ? f.advanceAmount : '' }))}
                    className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${editForm.advanceCollected ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${editForm.advanceCollected ? 'translate-x-5' : 'translate-x-0'}`}/>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{editForm.advanceCollected ? '✓ Advance Collected' : 'Advance Collected?'}</span>
                </label>
                {editForm.advanceCollected && (
                  <input type="number" min="0" value={editForm.advanceAmount}
                    onChange={e => setEditForm(f => ({ ...f, advanceAmount: e.target.value }))}
                    placeholder="Amount (₹)"
                    className="border border-green-300 bg-green-50 rounded-xl px-3 py-1.5 text-sm w-40 focus:ring-2 focus:ring-green-400 focus:outline-none"/>
                )}
              </div>

              {/* Insurance Status */}
              <div className="border-t border-gray-100 pt-3">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <div onClick={() => setEditForm(f => ({ ...f, isInsured: !f.isInsured, insuranceProvider: !f.isInsured ? f.insuranceProvider : '', insurancePolicyNo: !f.isInsured ? f.insurancePolicyNo : '' }))}
                    className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${editForm.isInsured ? 'bg-blue-500' : 'bg-gray-300'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${editForm.isInsured ? 'translate-x-5' : 'translate-x-0'}`}/>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{editForm.isInsured ? '✓ Patient is Insured' : 'Patient is Insured?'}</span>
                </label>
                {editForm.isInsured && (
                  <div className="space-y-2 ml-0">
                    <input type="text" value={editForm.insuranceProvider}
                      onChange={e => setEditForm(f => ({ ...f, insuranceProvider: e.target.value }))}
                      placeholder="Insurance Provider"
                      className="w-full border border-blue-300 bg-blue-50 rounded-xl px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"/>
                    <input type="text" value={editForm.insurancePolicyNo}
                      onChange={e => setEditForm(f => ({ ...f, insurancePolicyNo: e.target.value }))}
                      placeholder="Policy Number"
                      className="w-full border border-blue-300 bg-blue-50 rounded-xl px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"/>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={handleEdit} disabled={editSaving}
                  className="flex-1 py-2.5 bg-gradient-to-r from-gray-800 to-gray-700 text-white font-bold rounded-xl hover:from-gray-900 hover:to-gray-800 disabled:opacity-50 transition-all text-sm shadow-sm">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button onClick={() => setEditTarget(null)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      </>
      )}
    </Layout>
  );
};

export default PrebookingReport;
