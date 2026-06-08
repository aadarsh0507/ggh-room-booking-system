import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';

const today = () => new Date().toISOString().slice(0, 10);

const RoomSuggestionsPage = () => {
  const navigate = useNavigate();
  const [bookedDate, setBookedDate] = useState(today());
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadSuggestions = useCallback(async () => {
    if (!bookedDate) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/prebooking/suggest-rooms', { params: { bookedDate } });
      setSuggestions(response.data.suggestions || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load suggestions');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [bookedDate]);

  useEffect(() => { loadSuggestions(); }, [bookedDate, loadSuggestions]);

  const handleSelectBed = (suggestion) => {
    navigate('/prebooking', {
      state: {
        bedNo: suggestion.bedNo,
        roomType: suggestion.roomType,
        nurStation: suggestion.nurStation,
        roomNo: suggestion.roomNo,
      },
    });
  };

  const handlePreviousDay = () => {
    const prev = new Date(bookedDate);
    prev.setDate(prev.getDate() - 1);
    setBookedDate(prev.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const next = new Date(bookedDate);
    next.setDate(next.getDate() + 1);
    setBookedDate(next.toISOString().slice(0, 10));
  };

  const formatDateLabel = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const isToday = bookedDate === today();

  return (
    <Layout title="Available Beds">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-black text-gray-800">Available Beds</h2>
          <p className="text-xs text-gray-400 mt-0.5">Beds discharged &amp; billed — ready for new admissions</p>
        </div>
        <button
          onClick={() => navigate('/prebooking')}
          className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 rounded-xl px-4 py-2 text-sm font-semibold transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Pre-Booking
        </button>
      </div>

      {/* ── Date navigator ── */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl px-5 py-4 mb-5">
        {/* Date input — full width on its own row */}
        <input
          type="date"
          value={bookedDate}
          onChange={e => setBookedDate(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:outline-none mb-1"
        />
        <p className="text-xs text-gray-500 text-center mb-3">
          {formatDateLabel(bookedDate)}
          {isToday && <span className="ml-2 font-bold text-green-600">(Today)</span>}
        </p>
        {/* Nav buttons row */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreviousDay}
            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors text-sm"
          >
            ← Previous
          </button>
          <button
            onClick={() => setBookedDate(today())}
            className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Today
          </button>
          <button
            onClick={handleNextDay}
            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors text-sm"
          >
            Next →
          </button>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-green-200 border-t-green-600 mb-3"/>
          <p className="text-gray-500 text-sm font-medium">Finding available beds…</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {/* ── Empty state ── */}
      {!loading && suggestions.length === 0 && !error && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-6 py-14 text-center">
          <svg className="w-14 h-14 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12a9 9 0 019-9m0 0a9 9 0 019 9m-9-9v.01M3 12a9 9 0 019 9m0 0a9 9 0 019-9m-9 9v.01" />
          </svg>
          <h3 className="text-base font-bold text-gray-800 mb-1">No Available Beds</h3>
          <p className="text-sm text-gray-500 mb-1">
            No beds were discharged and billed on {formatDateLabel(bookedDate)}.
          </p>
          <p className="text-xs text-gray-400 mb-5">
            Try selecting a different date, or create a pre-booking without a suggestion.
          </p>
          <button
            onClick={() => navigate('/prebooking')}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Go to Pre-Booking
          </button>
        </div>
      )}

      {/* ── Summary strip ── */}
      {!loading && suggestions.length > 0 && (
        <>
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">
            <p className="text-green-800 font-bold">
              ✓ {suggestions.length} bed{suggestions.length > 1 ? 's' : ''} available on {formatDateLabel(bookedDate)}
            </p>
            <p className="text-green-700 text-xs mt-0.5">
              All beds have been discharged and billed — ready for new patients.
            </p>
          </div>

          {/* ── Bed grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {suggestions.map(suggestion => (
              <div
                key={suggestion.bedNo}
                onClick={() => handleSelectBed(suggestion)}
                className="group bg-white rounded-2xl shadow-sm hover:shadow-md border-2 border-green-200 hover:border-green-500 cursor-pointer transition-all overflow-hidden"
              >
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-3">
                  <p className="text-xl font-black font-mono">{suggestion.bedNo}</p>
                  <p className="text-green-100 text-xs mt-0.5">{suggestion.roomType}</p>
                </div>
                <div className="p-4">
                  <div className="flex gap-2 mb-3 flex-wrap">
                    <span className="px-2 py-0.5 bg-green-100 border border-green-300 rounded-full text-xs font-bold text-green-700">✓ Discharged</span>
                    <span className="px-2 py-0.5 bg-emerald-100 border border-emerald-300 rounded-full text-xs font-bold text-emerald-700">✓ Billed</span>
                  </div>
                  <div className="space-y-1.5 text-xs mb-4">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Ward</span>
                      <span className="font-semibold text-gray-800 truncate ml-2 max-w-[60%] text-right">{suggestion.wardName || suggestion.nurStation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Room</span>
                      <span className="font-semibold text-gray-800">{suggestion.roomNo || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status</span>
                      <span className="font-semibold text-green-700">{suggestion.status}</span>
                    </div>
                  </div>
                  <button className="w-full py-2 bg-green-600 group-hover:bg-green-700 text-white font-semibold rounded-xl transition-colors text-sm">
                    Select Bed
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Layout>
  );
};

export default RoomSuggestionsPage;
