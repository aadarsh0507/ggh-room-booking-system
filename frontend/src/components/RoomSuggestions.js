import React, { useState, useEffect } from 'react';
import api from '../services/api';

const RoomSuggestions = ({ roomType, nurStation, bookedDate, onSelectBed }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bookedDate) return;

    const fetchSuggestions = async () => {
      setLoading(true);
      setError('');
      try {
        const params = { bookedDate };
        if (roomType) params.roomType = roomType;
        if (nurStation) params.nurStation = nurStation;

        const response = await api.get('/prebooking/suggest-rooms', { params });
        setSuggestions(response.data.suggestions || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load room suggestions');
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, [bookedDate, roomType, nurStation]);

  if (!bookedDate) return null;

  return (
    <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M13 7H7v6h6V7z" />
        </svg>
        <h3 className="text-sm font-semibold text-blue-900">Suggested Rooms</h3>
        <span className="ml-auto text-xs text-blue-600 font-medium">
          Based on recent discharges
        </span>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border border-blue-300 border-t-blue-600"></div>
          <span className="ml-2 text-sm text-blue-600">Finding available rooms...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          {error}
        </div>
      )}

      {/* Suggestions List */}
      {!loading && suggestions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.bedNo}
              onClick={() => onSelectBed(suggestion)}
              className="p-3 bg-white border-2 border-green-300 rounded-lg hover:border-green-600 hover:shadow-lg cursor-pointer transition-all duration-200 group"
            >
              {/* Bed Info */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-green-900 group-hover:text-green-700">
                    {suggestion.bedNo}
                  </p>
                  <p className="text-xs text-gray-600">{suggestion.roomType}</p>
                </div>
                {suggestion.dischargedToday && suggestion.billedToday && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 border border-green-300 rounded-full text-xs font-bold text-green-700 animate-pulse">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Ready
                  </span>
                )}
              </div>

              {/* Status Badges */}
              <div className="flex gap-1 mb-2">
                <span className="inline-flex items-center gap-0.5 px-2 py-1 bg-green-50 border border-green-200 rounded text-xs font-semibold text-green-700">
                  ✓ Discharged
                </span>
                <span className="inline-flex items-center gap-0.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded text-xs font-semibold text-emerald-700">
                  ✓ Billed
                </span>
              </div>

              {/* Location */}
              <p className="text-xs text-gray-500 mb-2">
                📍 {suggestion.wardName || suggestion.nurStation || 'Ward'}
              </p>

              {/* Status */}
              <div className="text-xs text-green-600 font-medium mb-2">
                {suggestion.status}
              </div>

              {/* Click hint */}
              <div className="mt-2 text-center">
                <p className="text-xs font-semibold text-green-600 group-hover:text-green-700">
                  Click to select →
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !loading && (
          <div className="py-4 text-center">
            <p className="text-sm text-gray-600">
              {suggestions.length === 0
                ? '✗ No beds discharged and billed on this date'
                : 'No suggestions available'}
            </p>
          </div>
        )
      )}

      {/* Footer Note */}
      {!loading && suggestions.length > 0 && (
        <p className="mt-3 text-xs text-green-600 font-medium text-center">
          ✓ These beds were discharged and billed today - ready for new patients!
        </p>
      )}
    </div>
  );
};

export default RoomSuggestions;
