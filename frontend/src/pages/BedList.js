import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { useDashboard } from '../context/DashboardContext';

const ROWS_PER_PAGE = 15;

const BedList = () => {
  const location = useLocation();
  const { beds, loading, error, handleToggleBed } = useDashboard();
  const [bedStatus, setBedStatus] = useState(location.state?.statusFilter || 'Active');
  const [roomType,  setRoomType]  = useState('');
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const [toggling, setToggling]   = useState(null);

  const roomTypes = [...new Set(beds.map(b => b.ROOM_TYPE).filter(Boolean))].sort();

  const filtered = beds.filter(b => {
    if (bedStatus !== 'All' && b.STATUS !== bedStatus) return false;
    if (roomType && b.ROOM_TYPE !== roomType) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (b.BED_NO      || '').toLowerCase().includes(s) ||
           (b.NUR_STATION || '').toLowerCase().includes(s) ||
           (b.NS_SHORT    || '').toLowerCase().includes(s) ||
           (b.ROOM_NO     || '').toLowerCase().includes(s) ||
           (b.ROOM_TYPE   || '').toLowerCase().includes(s);
  });

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginated  = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const onToggle = async (bedNo, currentStatus) => {
    const action = currentStatus === 'Active' ? 'Inactive' : 'Active';
    if (!window.confirm(`Set bed ${bedNo} to ${action}?`)) return;
    setToggling(bedNo);
    try {
      await handleToggleBed(bedNo, currentStatus);
    } catch {
      alert(`Failed to update bed ${bedNo}. Please try again.`);
    } finally {
      setToggling(null);
    }
  };

  return (
    <Layout title="Bed List">
      {/* Toolbar */}
      <div className="bg-white shadow rounded-xl px-5 py-4 mb-6 flex flex-wrap items-center gap-3">
        {/* Status toggle */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {['Active', 'Inactive', 'All'].map(s => (
            <button
              key={s}
              onClick={() => { setBedStatus(s); setPage(1); }}
              className={`px-3 py-2 font-medium transition-colors ${
                bedStatus === s
                  ? s === 'Active'   ? 'bg-green-500 text-white'
                  : s === 'Inactive' ? 'bg-gray-500 text-white'
                  :                    'bg-blue-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s}
              <span className="ml-1 text-xs opacity-80">
                ({beds.filter(b => s === 'All' || b.STATUS === s).length})
              </span>
            </button>
          ))}
        </div>

        {/* Room type filter */}
        <select
          value={roomType}
          onChange={e => { setRoomType(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Room Types</option>
          {roomTypes.map(rt => <option key={rt} value={rt}>{rt}</option>)}
        </select>

        <div className="flex-1" />
        <span className="text-sm text-gray-400">{filtered.length} records</span>
        <input
          type="text"
          placeholder="Search bed, room, station…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
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
                  {['#','Nursing Station','NS Short','Bed No','Room No','Room Type','Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No records found.</td></tr>
                ) : paginated.map((b, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-400">{(page - 1) * ROWS_PER_PAGE + i + 1}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{b.NUR_STATION}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-600">{b.NS_SHORT}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{b.BED_NO}</td>
                    <td className="px-4 py-2.5">{b.ROOM_NO}</td>
                    <td className="px-4 py-2.5">{b.ROOM_TYPE}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => onToggle(b.BED_NO, b.STATUS)}
                        disabled={toggling === b.BED_NO}
                        title={`Click to set ${b.BED_NO} as ${b.STATUS === 'Active' ? 'Inactive' : 'Active'}`}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                          toggling === b.BED_NO
                            ? 'opacity-50 cursor-wait bg-gray-100 text-gray-400 border-gray-200'
                            : b.STATUS === 'Active'
                            ? 'bg-green-50 text-green-700 border-green-300 hover:bg-red-50 hover:text-red-700 hover:border-red-300 cursor-pointer'
                            : 'bg-gray-50 text-gray-500 border-gray-300 hover:bg-green-50 hover:text-green-700 hover:border-green-300 cursor-pointer'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${b.STATUS === 'Active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {toggling === b.BED_NO ? 'Updating…' : b.STATUS}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
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

export default BedList;
