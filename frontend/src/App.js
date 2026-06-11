import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardProvider } from './context/DashboardContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OccupiedBeds from './pages/OccupiedBeds';
import BedList from './pages/BedList';
import Prebooking from './pages/Prebooking';
import BookBed from './pages/BookBed';
import PrebookingReport from './pages/PreBookingReport';
import RoomSuggestionsPage from './pages/RoomSuggestionsPage';
import DischargeInitiated from './pages/DischargeInitiated';
import Settings from './pages/Settings';
import './App.css';

// ── Helpers ────────────────────────────────────────────────────────────────────

const getUser = () => {
  try { return JSON.parse(localStorage.getItem('user')) || {}; } catch { return {}; }
};

const getPermMatrix = () => {
  try {
    const saved = localStorage.getItem('rbm_role_permissions');
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return null;
};

// Returns true if the current user's role is allowed to view this page label.
// Falls back to "allow" when no matrix is saved (first launch).
const canAccess = (pageLabel) => {
  const user = getUser();
  const role = user.role || '';
  const matrix = getPermMatrix();
  if (!matrix || !role) return true;
  const row = matrix[pageLabel];
  if (!row) return true;
  return row[role] !== false;
};

// ── Guards ────────────────────────────────────────────────────────────────────

// Block unauthenticated users; also handles bfcache restores after logout.
const RequireAuth = ({ children }) => {
  const token = localStorage.getItem('token');

  useEffect(() => {
    const onPageShow = (e) => {
      // bfcache restore: page was served from cache; re-check token
      if (e.persisted && !localStorage.getItem('token')) {
        window.location.replace('/login');
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  if (!token) return <Navigate to="/login" replace />;
  return children;
};

// Block authenticated users from the login page
const PublicOnly = ({ children }) => {
  const token = localStorage.getItem('token');
  if (token) return <Navigate to="/" replace />;
  return children;
};

// Block access to a page if the role permission matrix says no.
// Re-evaluates when Admin saves permissions.
const RequirePerm = ({ label, children }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => setTick(t => t + 1);
    window.addEventListener('rbm_permissions_changed', refresh);
    return () => window.removeEventListener('rbm_permissions_changed', refresh);
  }, []);
  if (!canAccess(label)) return <Navigate to="/" replace />;
  return children;
};

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  return (
    <div className="App">
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <Login />
            </PublicOnly>
          }
        />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <DashboardProvider>
                <Routes>
                  <Route path="/" element={
                    <RequirePerm label="Dashboard"><Dashboard /></RequirePerm>
                  } />
                  <Route path="/occupied" element={
                    <RequirePerm label="Occupied Beds"><OccupiedBeds /></RequirePerm>
                  } />
                  <Route path="/bed-list" element={
                    <RequirePerm label="Bed List"><BedList /></RequirePerm>
                  } />
                  <Route path="/discharge" element={
                    <RequirePerm label="Discharge"><DischargeInitiated /></RequirePerm>
                  } />
                  <Route path="/room-suggestions" element={
                    <RequirePerm label="Available Beds"><RoomSuggestionsPage /></RequirePerm>
                  } />
                  <Route path="/book-bed" element={
                    <RequirePerm label="Book a Bed"><BookBed /></RequirePerm>
                  } />
                  <Route path="/prebooking" element={
                    <RequirePerm label="Book a Bed"><Prebooking /></RequirePerm>
                  } />
                  <Route path="/prebooking-report" element={
                    <RequirePerm label="Pre-Booking Report"><PrebookingReport /></RequirePerm>
                  } />
                  <Route path="/settings" element={
                    <RequirePerm label="Settings"><Settings /></RequirePerm>
                  } />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </DashboardProvider>
            </RequireAuth>
          }
        />
      </Routes>
    </div>
  );
}

export default App;
