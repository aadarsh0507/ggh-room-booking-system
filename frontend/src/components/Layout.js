import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { useDashboard } from '../context/DashboardContext';
import api from '../services/api';

const Layout = ({ title, children }) => {
  const { fetchData, toDate } = useDashboard();

  useEffect(() => { fetchData(toDate); }, []); // eslint-disable-line

  const user = (() => { try { return JSON.parse(localStorage.getItem('user')) || {}; } catch { return {}; } })();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const openChangePwd = () => {
    setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPwdError('');
    setPwdSuccess('');
    setShowChangePwd(true);
  };

  const handleChangePwd = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setPwdError('New passwords do not match');
      return;
    }
    if (pwdForm.newPassword.length < 6) {
      setPwdError('New password must be at least 6 characters');
      return;
    }
    setPwdLoading(true);
    try {
      await api.patch('/users/me/change-password', {
        currentPassword: pwdForm.currentPassword,
        newPassword: pwdForm.newPassword,
      });
      setPwdSuccess('Password changed successfully');
      setTimeout(() => setShowChangePwd(false), 1500);
    } catch (err) {
      setPwdError(err.response?.data?.message || 'Failed to change password');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100 overflow-hidden">

      {/* ── Mobile sidebar backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──
           Mobile: fixed drawer (out of flow), slides in/out.
           Desktop (lg+): static, occupies w-56 in the flex row.
           The wrapping div is w-0 on mobile (no space) and w-56 on lg+.
      -->*/}
      <div className="hidden lg:block w-56 flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile drawer — rendered in a portal-like fixed layer, never affects layout */}
      <div className={`
        fixed inset-y-0 left-0 z-30
        transform transition-transform duration-200 ease-in-out
        lg:hidden
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* ── Main content — always fills remaining width, no offset needed ── */}
      <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden">

        {/* Topbar */}
        <header className="bg-white shadow-sm flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 flex-shrink-0">

          {/* Left: hamburger (mobile) + title */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — hidden on lg+ */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-base sm:text-xl font-bold text-gray-800 truncate">{title}</h1>
          </div>

          {/* Right: live badge + user actions */}
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <span className="hidden sm:inline text-xs bg-green-50 text-green-600 px-2 py-1 rounded-full font-medium">● Live</span>

            {/* User avatar + name (name hidden on very small screens) */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold text-gray-800 leading-tight">{user.username || 'User'}</p>
                <p className="text-xs text-gray-400 leading-tight">{user.role || ''}</p>
              </div>
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">
                  {(user.username || 'U')[0].toUpperCase()}
                </span>
              </div>

              {/* Change password — icon-only on mobile, icon+label on sm+ */}
              <button
                onClick={openChangePwd}
                title="Change Password"
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <span className="hidden sm:inline">Password</span>
              </button>

              {/* Logout — icon-only on mobile, icon+label on sm+ */}
              <button
                onClick={handleLogout}
                title="Logout"
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>

      {/* ── Change Password Modal ── */}
      {showChangePwd && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-800">Change Password</h2>
              <button onClick={() => setShowChangePwd(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {pwdSuccess ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-green-700">{pwdSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handleChangePwd} className="space-y-4">
                {pwdError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
                    {pwdError}
                  </div>
                )}
                {['currentPassword', 'newPassword', 'confirmPassword'].map((field, i) => (
                  <div key={field}>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                      {['Current Password', 'New Password', 'Confirm New Password'][i]}
                    </label>
                    <input
                      type="password"
                      value={pwdForm[field]}
                      onChange={e => setPwdForm(f => ({ ...f, [field]: e.target.value }))}
                      required
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {pwdLoading ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
