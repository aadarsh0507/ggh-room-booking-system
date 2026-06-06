import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import { useDashboard } from '../context/DashboardContext';

const ROLES = ['Admin', 'Receptionist', 'Nurse', 'Billing', 'Doctor'];

const ROLE_COLORS = {
  Admin:        'bg-red-100 text-red-700',
  Receptionist: 'bg-blue-100 text-blue-700',
  Nurse:        'bg-green-100 text-green-700',
  Billing:      'bg-yellow-100 text-yellow-700',
  Doctor:       'bg-purple-100 text-purple-700',
};

// Feature matrix — { feature, description, access: Set of roles }
const FEATURES = [
  {
    group: 'Pages',
    items: [
      { label: 'Dashboard',            desc: 'KPI cards, occupancy heatmap, charts',             roles: ['Admin','Receptionist','Nurse','Billing','Doctor'] },
      { label: 'Occupied Beds',        desc: 'View current in-patients & bystanders',            roles: ['Admin','Receptionist','Nurse','Billing','Doctor'] },
      { label: 'Bed List',             desc: 'View all beds with status',                        roles: ['Admin','Receptionist','Nurse'] },
      { label: 'Discharge',            desc: 'Patients awaiting billing after discharge',        roles: ['Admin','Receptionist','Billing'] },
      { label: 'Book a Bed',           desc: 'Browse available beds & create pre-bookings',      roles: ['Admin','Receptionist'] },
      { label: 'Pre-Booking Report',   desc: 'View, filter & export pre-booking records',        roles: ['Admin','Receptionist','Nurse'] },
      { label: 'Settings',             desc: 'User management, permissions, restrictions',       roles: ['Admin'] },
    ],
  },
  {
    group: 'Bed Management',
    items: [
      { label: 'Toggle Bed Active/Inactive', desc: 'Enable or disable a bed from the Bed List', roles: ['Admin','Receptionist'] },
      { label: 'Block Room Type Booking',    desc: 'Restrict a room type from being pre-booked', roles: ['Admin'] },
    ],
  },
  {
    group: 'Pre-Booking Actions',
    items: [
      { label: 'Create Pre-Booking',   desc: 'Reserve an available bed for a patient',          roles: ['Admin','Receptionist'] },
      { label: 'Cancel Pre-Booking',   desc: 'Cancel a confirmed pre-booking',                  roles: ['Admin','Receptionist'] },
      { label: 'Mark as Admitted',     desc: 'Confirm patient has been physically admitted',    roles: ['Admin','Receptionist','Nurse'] },
    ],
  },
  {
    group: 'User & System',
    items: [
      { label: 'Add / Edit Users',     desc: 'Create or modify user accounts',                  roles: ['Admin'] },
      { label: 'Reset User Password',  desc: 'Force-reset another user\'s password',            roles: ['Admin'] },
      { label: 'Deactivate Users',     desc: 'Disable login for a user account',               roles: ['Admin'] },
      { label: 'Change Own Password',  desc: 'Update personal login password',                  roles: ['Admin','Receptionist','Nurse','Billing','Doctor'] },
    ],
  },
];

const ROLE_DESCRIPTIONS = {
  Admin:        'Full system access — manages users, settings, and all operations.',
  Receptionist: 'Front-desk operations — bed bookings, patient check-in, and reports.',
  Nurse:        'Ward operations — views patients, marks admissions, and bed status.',
  Billing:      'Finance view — monitors discharge queue and occupied beds for billing.',
  Doctor:       'Clinical view — read-only access to current patients and dashboard.',
};

const EMPTY_FORM = { username: '', password: '', role: 'Receptionist', branch: 'Main' };

const Input = ({ label, required, ...props }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      {...props}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
    />
  </div>
);

const Settings = () => {
  const location = useLocation();
  const { fetchRestrictions } = useDashboard();
  const [tab, setTab] = useState(location.state?.tab || 'users');

  // ── editable permissions matrix ──────────────────────────────────────────────
  // permMatrix: { [featureLabel]: { [role]: boolean } }
  const buildDefaultMatrix = () => {
    const m = {};
    FEATURES.forEach(g => g.items.forEach(item => {
      m[item.label] = {};
      ROLES.forEach(role => { m[item.label][role] = item.roles.includes(role); });
    }));
    return m;
  };
  const PERM_STORAGE_KEY = 'rbm_role_permissions';
  const loadMatrix = () => {
    try {
      const saved = localStorage.getItem(PERM_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return buildDefaultMatrix();
  };
  const [permMatrix, setPermMatrix]   = useState(loadMatrix);
  const [permEditing, setPermEditing] = useState(false);
  const [permDraft,   setPermDraft]   = useState(null); // working copy while editing
  const [permSaved,   setPermSaved]   = useState(false);

  const startEdit = () => { setPermDraft(JSON.parse(JSON.stringify(permMatrix))); setPermEditing(true); setPermSaved(false); };
  const cancelEdit = () => { setPermDraft(null); setPermEditing(false); };
  const toggleCell = (label, role) => {
    setPermDraft(prev => ({ ...prev, [label]: { ...prev[label], [role]: !prev[label][role] } }));
  };
  const savePermissions = () => {
    localStorage.setItem(PERM_STORAGE_KEY, JSON.stringify(permDraft));
    setPermMatrix(permDraft);
    setPermEditing(false);
    setPermDraft(null);
    setPermSaved(true);
    setTimeout(() => setPermSaved(false), 3000);
  };
  const resetToDefaults = () => {
    if (!window.confirm('Reset all permissions to system defaults?')) return;
    const defaults = buildDefaultMatrix();
    localStorage.setItem(PERM_STORAGE_KEY, JSON.stringify(defaults));
    setPermMatrix(defaults);
    setPermEditing(false);
    setPermDraft(null);
  };
  const activeMatrix = permEditing ? permDraft : permMatrix;

  // ── booking restrictions ─────────────────────────────────────────────────────
  const [restrictions, setRestrictions]   = useState([]);
  const [restLoading, setRestLoading]     = useState(false);
  const [restSearch, setRestSearch]       = useState('');
  const [toggling, setToggling]           = useState(null);
  const [reasonModal, setReasonModal]     = useState(null); // { roomType }
  const [reasonText, setReasonText]       = useState('');

  // ── user list ────────────────────────────────────────────────────────────────
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [listError, setListError] = useState('');

  // ── add user form ────────────────────────────────────────────────────────────
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving]       = useState(false);

  // ── edit user modal ──────────────────────────────────────────────────────────
  const [editUser, setEditUser]     = useState(null);
  const [editForm, setEditForm]     = useState({});
  const [editError, setEditError]   = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ── reset password modal ─────────────────────────────────────────────────────
  const [resetUser, setResetUser]   = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPwd, setConfirmPwd]   = useState('');
  const [resetError, setResetError]   = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetDone, setResetDone]     = useState(false);

  // ── load users ───────────────────────────────────────────────────────────────
  const loadUsers = useCallback(() => {
    setLoading(true);
    setListError('');
    api.get('/users')
      .then(r => setUsers(r.data.users))
      .catch(err => setListError(err.response?.data?.message || 'Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const loadRestrictions = useCallback(() => {
    setRestLoading(true);
    api.get('/prebooking/room-type-restrictions')
      .then(r => setRestrictions(r.data.restrictions))
      .catch(() => {})
      .finally(() => setRestLoading(false));
  }, []);

  useEffect(() => { if (tab === 'restrictions') loadRestrictions(); }, [tab, loadRestrictions]);

  const handleBlock = async (roomType, reason) => {
    setToggling(roomType);
    try {
      await api.post('/prebooking/room-type-restrictions', { roomType, reason });
      setRestrictions(prev => prev.map(r => r.roomType === roomType ? { ...r, blocked: true, reason } : r));
      fetchRestrictions(); // sync Dashboard context
    } catch { alert('Failed to block room type.'); }
    finally { setToggling(null); setReasonModal(null); setReasonText(''); }
  };

  const handleUnblock = async (roomType) => {
    if (!window.confirm(`Allow booking for "${roomType}" again?`)) return;
    setToggling(roomType);
    try {
      await api.delete(`/prebooking/room-type-restrictions/${encodeURIComponent(roomType)}`);
      setRestrictions(prev => prev.map(r => r.roomType === roomType ? { ...r, blocked: false, reason: '', blockedBy: '' } : r));
      fetchRestrictions(); // sync Dashboard context
    } catch { alert('Failed to unblock room type.'); }
    finally { setToggling(null); }
  };

  // ── add user ─────────────────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.username || !form.password || !form.role) {
      return setFormError('Username, password and role are required.');
    }
    if (form.password.length < 6) return setFormError('Password must be at least 6 characters.');
    setSaving(true);
    try {
      await api.post('/users', form);
      setShowAdd(false);
      setForm(EMPTY_FORM);
      loadUsers();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  // ── open edit ────────────────────────────────────────────────────────────────
  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({ username: u.username, role: u.role, branch: u.branch, isActive: u.isActive });
    setEditError('');
  };

  // ── save edit ────────────────────────────────────────────────────────────────
  const handleEditSave = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditSaving(true);
    try {
      await api.put(`/users/${editUser.id}`, editForm);
      setEditUser(null);
      loadUsers();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update user.');
    } finally {
      setEditSaving(false);
    }
  };

  // ── reset password ───────────────────────────────────────────────────────────
  const openReset = (u) => {
    setResetUser(u);
    setNewPassword('');
    setConfirmPwd('');
    setResetError('');
    setResetDone(false);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setResetError('');
    if (newPassword.length < 6) return setResetError('Password must be at least 6 characters.');
    if (newPassword !== confirmPwd) return setResetError('Passwords do not match.');
    setResetSaving(true);
    try {
      await api.patch(`/users/${resetUser.id}/reset-password`, { newPassword });
      setResetDone(true);
    } catch (err) {
      setResetError(err.response?.data?.message || 'Failed to reset password.');
    } finally {
      setResetSaving(false);
    }
  };

  // ── deactivate ───────────────────────────────────────────────────────────────
  const handleDeactivate = async (u) => {
    if (!window.confirm(`Deactivate user "${u.username}"? They will no longer be able to log in.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      loadUsers();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to deactivate user.');
    }
  };

  const handleReactivate = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { isActive: true });
      loadUsers();
    } catch (err) {
      alert('Failed to reactivate user.');
    }
  };

  return (
    <Layout title="Settings">

      {/* ── Tab bar ── */}
      <div className="flex gap-1 mb-6 bg-white shadow rounded-xl p-1 w-fit">
        {[
          { key: 'users',        label: 'User Management',      icon: '👥' },
          { key: 'permissions',  label: 'Role Permissions',     icon: '🔐' },
          { key: 'restrictions', label: 'Booking Restrictions', icon: '🚫' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              tab === t.key ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════ USER MANAGEMENT ═════════════════════════════ */}
      {tab === 'users' && (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{users.filter(u => u.isActive).length} active · {users.filter(u => !u.isActive).length} inactive</p>
            <button
              onClick={() => { setShowAdd(true); setForm(EMPTY_FORM); setFormError(''); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <span className="text-lg leading-none">+</span> Add User
            </button>
          </div>

          {listError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{listError}</div>
          )}

          {/* Users table */}
          <div className="bg-white shadow rounded-xl overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-gray-400">Loading users…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['#', 'Username', 'Role', 'Branch', 'Status', 'Last Login', 'Created', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No users found.</td></tr>
                    ) : users.map((u, i) => (
                      <tr key={u.id} className={`hover:bg-gray-50 ${!u.isActive ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{u.username}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{u.branch}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                          {u.lastLogin ? new Date(u.lastLogin).toLocaleString('en-GB') : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                          {new Date(u.createdAt).toLocaleDateString('en-GB')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => openEdit(u)}
                              className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                            >Edit</button>
                            <button
                              onClick={() => openReset(u)}
                              className="px-2.5 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg text-xs font-medium hover:bg-yellow-100 transition-colors"
                            >Reset Pwd</button>
                            {u.isActive ? (
                              <button
                                onClick={() => handleDeactivate(u)}
                                className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                              >Deactivate</button>
                            ) : (
                              <button
                                onClick={() => handleReactivate(u)}
                                className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                              >Reactivate</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════ ROLE PERMISSIONS ════════════════════════════ */}
      {tab === 'permissions' && (
        <>
          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-black text-gray-800">Role Permissions Matrix</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {permEditing ? (
                  <span className="text-amber-600 font-semibold">Editing mode — click any cell to toggle access</span>
                ) : (
                  'Click Edit Permissions to customise access per role'
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {permSaved && (
                <span className="flex items-center gap-1.5 text-xs text-green-600 font-semibold bg-green-50 border border-green-200 px-3 py-1.5 rounded-xl">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  Permissions saved
                </span>
              )}
              {permEditing ? (
                <>
                  <button onClick={savePermissions}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
                    Save Changes
                  </button>
                  <button onClick={cancelEdit}
                    className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button onClick={startEdit}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                    Edit Permissions
                  </button>
                  <button onClick={resetToDefaults}
                    className="px-4 py-2 bg-gray-100 text-gray-500 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                    title="Reset to system defaults">
                    Reset Defaults
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Role summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
            {ROLES.map(role => {
              const count = FEATURES.flatMap(g => g.items).filter(f => activeMatrix[f.label]?.[role]).length;
              return (
                <div key={role} className={`bg-white rounded-2xl shadow-sm border p-4 transition-all ${permEditing ? 'border-blue-200 bg-blue-50/20' : 'border-gray-100'}`}>
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${ROLE_COLORS[role]}`}>{role}</span>
                  <p className="text-xs text-gray-400 mt-2 leading-snug">{ROLE_DESCRIPTIONS[role]}</p>
                  <p className="mt-2 text-xs font-black text-gray-600">{count} permissions</p>
                </div>
              );
            })}
          </div>

          {/* Feature matrix table */}
          <div className={`bg-white rounded-2xl shadow-sm overflow-hidden transition-all ${permEditing ? 'border-2 border-blue-300 ring-2 ring-blue-100' : 'border border-gray-100'}`}>
            {permEditing && (
              <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                </svg>
                <span className="text-xs text-amber-700 font-semibold">
                  Editing active — click any ✓ or ✗ cell to toggle. Changes are not saved until you click <strong>Save Changes</strong>.
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-72">Feature / Permission</th>
                    {ROLES.map(role => (
                      <th key={role} className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-1 rounded-full ${ROLE_COLORS[role]}`}>{role}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map(group => (
                    <React.Fragment key={group.group}>
                      <tr className="bg-gray-50 border-y border-gray-100">
                        <td colSpan={ROLES.length + 1} className="px-5 py-2">
                          <span className="text-xs font-black text-gray-400 uppercase tracking-widest">{group.group}</span>
                        </td>
                      </tr>
                      {group.items.map((item, idx) => (
                        <tr key={item.label} className={`border-b border-gray-50 transition-colors ${idx % 2 !== 0 ? 'bg-gray-50/40' : 'bg-white'} ${permEditing ? 'hover:bg-blue-50/40' : 'hover:bg-gray-50'}`}>
                          <td className="px-5 py-3">
                            <p className="font-semibold text-gray-800 text-xs">{item.label}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                          </td>
                          {ROLES.map(role => {
                            const allowed = activeMatrix[item.label]?.[role] ?? false;
                            return (
                              <td key={role} className="px-4 py-3 text-center">
                                <button
                                  onClick={() => permEditing && toggleCell(item.label, role)}
                                  disabled={!permEditing}
                                  title={permEditing ? (allowed ? `Remove ${role} access` : `Grant ${role} access`) : undefined}
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition-all ${
                                    permEditing
                                      ? 'cursor-pointer hover:scale-110 hover:shadow-md'
                                      : 'cursor-default'
                                  } ${allowed
                                      ? 'bg-green-100 hover:bg-green-200'
                                      : 'bg-gray-100 hover:bg-red-50'
                                  }`}
                                >
                                  {allowed ? (
                                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                    </svg>
                                  ) : (
                                    <svg className={`w-4 h-4 ${permEditing ? 'text-gray-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                    </svg>
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom save bar when editing */}
            {permEditing && (
              <div className="border-t border-blue-200 bg-blue-50 px-5 py-3 flex items-center justify-between">
                <span className="text-xs text-blue-600 font-semibold">
                  {FEATURES.flatMap(g => g.items).reduce((sum, f) =>
                    sum + ROLES.filter(r => permDraft[f.label]?.[r]).length, 0
                  )} total permissions granted across all roles
                </span>
                <div className="flex gap-2">
                  <button onClick={cancelEdit}
                    className="px-4 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                    Discard
                  </button>
                  <button onClick={savePermissions}
                    className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════ ADD USER MODAL ══════════════════════════════ */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Add New User</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
              <Input label="Username" required value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="e.g. john.doe" />
              <Input label="Password" required type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 6 characters" />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Role <span className="text-red-500">*</span></label>
                  <select
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Branch</label>
                  <input
                    value={form.branch}
                    onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                    placeholder="Main"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Permissions preview */}
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">This role can access</p>
                <div className="flex flex-wrap gap-1.5">
                  {FEATURES.flatMap(g => g.items).filter(f => permMatrix[f.label]?.[form.role]).map(f => (
                    <span key={f.label} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{f.label}</span>
                  ))}
                </div>
              </div>

              {formError && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{formError}</div>}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
                  {saving ? 'Creating…' : 'Create User'}
                </button>
                <button type="button" onClick={() => setShowAdd(false)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════ EDIT USER MODAL ═════════════════════════════ */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Edit User</h2>
                <p className="text-xs text-gray-400 mt-0.5">ID #{editUser.id}</p>
              </div>
              <button onClick={() => setEditUser(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <form onSubmit={handleEditSave} className="px-6 py-5 space-y-4">
              <Input label="Username" required value={editForm.username || ''} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Role</label>
                  <select
                    value={editForm.role || ''}
                    onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <Input label="Branch" value={editForm.branch || ''} onChange={e => setEditForm(f => ({ ...f, branch: e.target.value }))} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Account Status</label>
                <div className="flex gap-3">
                  {[true, false].map(val => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, isActive: val }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        editForm.isActive === val
                          ? val ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500'
                          : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {val ? 'Active' : 'Inactive'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Permissions preview */}
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Access for {editForm.role}</p>
                <div className="flex flex-wrap gap-1.5">
                  {FEATURES.flatMap(g => g.items).filter(f => permMatrix[f.label]?.[editForm.role]).map(f => (
                    <span key={f.label} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{f.label}</span>
                  ))}
                </div>
              </div>

              {editError && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{editError}</div>}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={editSaving}
                  className="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setEditUser(null)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════ BOOKING RESTRICTIONS ════════════════════════ */}
      {tab === 'restrictions' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-bold text-gray-800">Room Type Booking Restrictions</h2>
              <p className="text-xs text-gray-400 mt-0.5">Blocked room types will not appear in the Book a Bed screen</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
                </svg>
                <input type="text" placeholder="Search room type…" value={restSearch}
                  onChange={e => setRestSearch(e.target.value)}
                  className="pl-9 pr-3 border border-gray-200 rounded-xl py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <button onClick={loadRestrictions} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                Refresh
              </button>
            </div>
          </div>

          {/* Summary strip */}
          <div className="flex gap-3 mb-4">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-sm font-semibold text-red-700">{restrictions.filter(r => r.blocked).length} Blocked</span>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="text-sm font-semibold text-green-700">{restrictions.filter(r => !r.blocked).length} Allowed</span>
            </div>
          </div>

          {restLoading ? (
            <div className="py-16 text-center text-gray-400">Loading room types…</div>
          ) : (
            <div className="bg-white shadow-sm border border-gray-100 rounded-2xl overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['#', 'Room Type', 'Booking Status', 'Reason / Note', 'Blocked By', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {restrictions
                    .filter(r => !restSearch || r.roomType.toLowerCase().includes(restSearch.toLowerCase()))
                    .map((r, i) => (
                      <tr key={r.roomType} className={`transition-colors ${r.blocked ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{r.roomType}</td>
                        <td className="px-4 py-3">
                          {r.blocked ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              Blocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              Allowed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate" title={r.reason}>
                          {r.reason || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{r.blockedBy || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {r.blocked ? (
                            <button
                              onClick={() => handleUnblock(r.roomType)}
                              disabled={toggling === r.roomType}
                              className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 disabled:opacity-50 transition-colors"
                            >
                              {toggling === r.roomType ? 'Updating…' : 'Allow Booking'}
                            </button>
                          ) : (
                            <button
                              onClick={() => { setReasonModal(r); setReasonText(''); }}
                              disabled={toggling === r.roomType}
                              className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-100 disabled:opacity-50 transition-colors"
                            >
                              Block Booking
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Block reason modal ── */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Block Room Type</h2>
                <p className="text-xs text-gray-400 mt-0.5">{reasonModal.roomType}</p>
              </div>
              <button onClick={() => setReasonModal(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                Beds in <strong>{reasonModal.roomType}</strong> will be hidden from the Book a Bed screen. Existing confirmed bookings are unaffected.
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Reason (optional)</label>
                <textarea rows={3} value={reasonText} onChange={e => setReasonText(e.target.value)}
                  placeholder="e.g. ICU beds require direct admission, not pre-booking…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none resize-none"/>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleBlock(reasonModal.roomType, reasonText)}
                  className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors text-sm"
                >
                  Confirm Block
                </button>
                <button onClick={() => setReasonModal(null)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ RESET PASSWORD MODAL ════════════════════════ */}
      {resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Reset Password</h2>
                <p className="text-xs text-gray-400 mt-0.5">{resetUser.username}</p>
              </div>
              <button onClick={() => setResetUser(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            {resetDone ? (
              <div className="px-6 py-8 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-green-600 text-xl">✓</span>
                </div>
                <p className="text-gray-700 font-medium">Password reset successfully</p>
                <button onClick={() => setResetUser(null)} className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Done</button>
              </div>
            ) : (
              <form onSubmit={handleReset} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">New Password <span className="text-red-500">*</span></label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Confirm Password <span className="text-red-500">*</span></label>
                  <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                {resetError && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{resetError}</div>}
                <div className="flex gap-3 pt-1">
                  <button type="submit" disabled={resetSaving}
                    className="flex-1 py-2.5 bg-yellow-500 text-white font-semibold rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition-colors text-sm">
                    {resetSaving ? 'Resetting…' : 'Reset Password'}
                  </button>
                  <button type="button" onClick={() => setResetUser(null)}
                    className="px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors text-sm">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </Layout>
  );
};

export default Settings;
