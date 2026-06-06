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

  // Load suggestions
  const loadSuggestions = useCallback(async () => {
    if (!bookedDate) return;

    setLoading(true);
    setError('');
    try {
      const response = await api.get('/prebooking/suggest-rooms', {
        params: { bookedDate },
      });
      setSuggestions(response.data.suggestions || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load suggestions');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [bookedDate]);

  useEffect(() => {
    loadSuggestions();
  }, [bookedDate, loadSuggestions]);

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

  const handleToday = () => {
    setBookedDate(today());
  };

  // Formats date as "Monday, June 3"
  const formatDateLabel = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  // Check if date is today
  const isToday = bookedDate === today();

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-900">
                🏥 Available Beds
              </h1>
              <p className="text-sm text-gray-600">
                Beds discharged & billed today
              </p>
            </div>
            <p className="text-gray-600">
              These beds are ready for new patient admissions. Click any bed to start a pre-booking.
            </p>
          </div>

          {/* Date Selector */}
          <div className="mb-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={handlePreviousDay}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
              >
                ← Previous
              </button>

              <div className="flex-1 min-w-[300px]">
                <input
                  type="date"
                  value={bookedDate}
                  onChange={(e) => setBookedDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
                <p className="text-sm text-gray-600 mt-1">
                  {formatDateLabel(bookedDate)}
                  {isToday && <span className="ml-2 font-semibold text-green-600">(Today)</span>}
                </p>
              </div>

              <button
                onClick={handleToday}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
              >
                Today
              </button>

              <button
                onClick={handleNextDay}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
              >
                Next →
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-200 border-t-green-600 mb-4"></div>
              <p className="text-gray-600 font-medium">Finding available beds...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 mb-6">
              <p className="text-red-700 font-medium">⚠️ Error</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && suggestions.length === 0 && !error && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12a9 9 0 019-9m0 0a9 9 0 019 9m-9-9v.01M3 12a9 9 0 019 9m0 0a9 9 0 019-9m-9 9v.01" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">No Available Beds</h3>
              <p className="text-gray-600 mb-4">
                No beds were discharged and billed on {formatDateLabel(bookedDate)}.
              </p>
              <p className="text-sm text-gray-500">
                Try selecting a different date, or create a pre-booking without a suggestion.
              </p>
              <button
                onClick={() => navigate('/prebooking')}
                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Go to Pre-Booking
              </button>
            </div>
          )}

          {/* Suggestions Grid */}
          {!loading && suggestions.length > 0 && (
            <div>
              {/* Summary */}
              <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-xl p-4">
                <p className="text-green-800 font-semibold">
                  ✓ {suggestions.length} bed{suggestions.length > 1 ? 's' : ''} available on {formatDateLabel(bookedDate)}
                </p>
                <p className="text-green-700 text-sm mt-1">
                  All beds have been discharged and billed today - ready for new patients!
                </p>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.bedNo}
                    onClick={() => handleSelectBed(suggestion)}
                    className="group bg-white rounded-xl shadow-md hover:shadow-xl border-2 border-green-200 hover:border-green-500 cursor-pointer transition-all duration-300 overflow-hidden"
                  >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-4">
                      <p className="text-2xl font-bold font-mono">{suggestion.bedNo}</p>
                      <p className="text-green-100 text-sm mt-1">{suggestion.roomType}</p>
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      {/* Badges */}
                      <div className="flex gap-2 mb-4">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 border border-green-300 rounded-full text-xs font-bold text-green-700">
                          ✓ Discharged
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 border border-emerald-300 rounded-full text-xs font-bold text-emerald-700">
                          ✓ Billed
                        </span>
                      </div>

                      {/* Details */}
                      <div className="space-y-2 text-sm mb-4">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Ward:</span>
                          <span className="font-semibold text-gray-900">{suggestion.wardName || suggestion.nurStation}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Room:</span>
                          <span className="font-semibold text-gray-900">{suggestion.roomNo || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Status:</span>
                          <span className="font-semibold text-green-700">{suggestion.status}</span>
                        </div>
                      </div>

                      {/* Click Button */}
                      <button
                        className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                      >
                        Select Bed
                      </button>
                    </div>

                    {/* Hover indicator */}
                    <div className="absolute top-0 right-0 w-0 h-0 group-hover:w-12 group-hover:h-12 border-l-[3rem] border-t-[3rem] border-l-transparent border-t-green-400 transition-all duration-300"></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Button */}
          {!loading && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={() => navigate('/prebooking')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-300"
              >
                ← Back to Pre-Booking
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default RoomSuggestionsPage;
