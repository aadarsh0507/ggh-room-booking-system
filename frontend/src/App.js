import React from 'react';
import { Routes, Route } from 'react-router-dom';
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

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <DashboardProvider>
              <Routes>
                <Route path="/"          element={<Dashboard />} />
                <Route path="/occupied"  element={<OccupiedBeds />} />
                <Route path="/bed-list"    element={<BedList />} />
                <Route path="/discharge"  element={<DischargeInitiated />} />
                <Route path="/prebooking" element={<Prebooking />} />
                <Route path="/room-suggestions" element={<RoomSuggestionsPage />} />
                <Route path="/book-bed" element={<BookBed />} />
                <Route path="/prebooking-report" element={<PrebookingReport />} />
                <Route path="/settings"  element={<Settings />} />
              </Routes>
            </DashboardProvider>
          }
        />
      </Routes>
    </div>
  );
}

export default App;
