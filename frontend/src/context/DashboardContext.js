import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../services/api';

const today = () => new Date().toISOString().slice(0, 10);

const DashboardContext = createContext(null);

export const DashboardProvider = ({ children }) => {
  const [stats, setStats]                 = useState(null);
  const [patients, setPatients]           = useState([]);
  const [beds, setBeds]                   = useState([]);
  const [roomTypeStats, setRoomTypeStats] = useState([]);
  const [toDate, setToDate]               = useState(today());
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');

  // Set of blocked room types — loaded once, updated when settings change
  const [blockedRoomTypes, setBlockedRoomTypes] = useState(new Set());

  const fetchRestrictions = useCallback(() => {
    api.get('/prebooking/room-type-restrictions')
      .then(res => {
        const blocked = new Set(
          res.data.restrictions.filter(r => r.blocked).map(r => r.roomType)
        );
        setBlockedRoomTypes(blocked);
      })
      .catch(() => {}); // non-fatal — silently ignore
  }, []);

  useEffect(() => { fetchRestrictions(); }, [fetchRestrictions]);

  const fetchData = useCallback((to) => {
    setLoading(true);
    setError('');
    const params = {};
    if (to) params.toDate = to;

    api.get('/dashboard/stats', { params })
      .then(res => {
        setStats(res.data.stats);
        setPatients(res.data.patients);
        setBeds(res.data.beds);
        setRoomTypeStats(res.data.roomTypeStats || []);
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }, []);

  const handleToggleBed = async (bedNo, currentStatus) => {
    const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    const res = await api.patch(`/dashboard/beds/${encodeURIComponent(bedNo)}/toggle-status`, { currentStatus });
    setBeds(prev => prev.map(b => b.BED_NO === bedNo ? { ...b, STATUS: res.data.status } : b));
    setStats(prev => {
      const wasActive = currentStatus === 'Active';
      return {
        ...prev,
        activeBeds:    prev.activeBeds   + (wasActive ? -1 : 1),
        inactiveBeds:  prev.inactiveBeds + (wasActive ?  1 : -1),
        availableBeds: Math.max(0, prev.availableBeds + (wasActive ? -1 : 1)),
      };
    });
    return newStatus;
  };

  return (
    <DashboardContext.Provider value={{
      stats, patients, beds, roomTypeStats,
      toDate, setToDate,
      loading, error,
      fetchData, handleToggleBed,
      blockedRoomTypes, fetchRestrictions,
    }}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => useContext(DashboardContext);
export { today };
