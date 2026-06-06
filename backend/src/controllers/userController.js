const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { query } = require('../config/database');
const bcrypt = require('bcryptjs');

// GET /api/users — list all users (Admin only)
exports.listUsers = asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT `id`,`username`,`email`,`role`,`branch`,`isActive`,`lastLogin`,`createdAt` FROM `Users` ORDER BY `createdAt` DESC'
  );
  res.json({ users: rows });
});

// POST /api/users — create user (Admin only)
exports.createUser = asyncHandler(async (req, res) => {
  const { username, password, role, branch } = req.body;
  if (!username || !password || !role) {
    res.status(400); throw new Error('username, password and role are required');
  }
  const existingByUsername = await User.findByUsername(username);
  if (existingByUsername) { res.status(409); throw new Error('Username already taken'); }

  const email = `${username}@hospital.local`;
  const user = await User.create({ username, email, password, role, branch: branch || 'Main' });
  res.status(201).json({ user });
});

// PUT /api/users/:id — update user details/role (Admin only)
exports.updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { username, email, role, branch, isActive } = req.body;

  const [existing] = await query('SELECT id FROM `Users` WHERE `id` = ?', [id]);
  if (!existing) { res.status(404); throw new Error('User not found'); }

  const fields = [];
  const vals   = [];
  if (username  !== undefined) { fields.push('`username` = ?');  vals.push(username); }
  if (email     !== undefined) { fields.push('`email` = ?');     vals.push(email); }
  if (role      !== undefined) { fields.push('`role` = ?');      vals.push(role); }
  if (branch    !== undefined) { fields.push('`branch` = ?');    vals.push(branch); }
  if (isActive  !== undefined) { fields.push('`isActive` = ?');  vals.push(isActive ? 1 : 0); }

  if (fields.length === 0) { res.status(400); throw new Error('No fields to update'); }

  vals.push(id);
  await query(`UPDATE \`Users\` SET ${fields.join(', ')} WHERE \`id\` = ?`, vals);
  const user = await User.findById(id);
  res.json({ user });
});

// PATCH /api/users/:id/reset-password — Admin resets any user's password
exports.resetPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    res.status(400); throw new Error('Password must be at least 6 characters');
  }
  const [existing] = await query('SELECT id FROM `Users` WHERE `id` = ?', [id]);
  if (!existing) { res.status(404); throw new Error('User not found'); }

  const hashed = await bcrypt.hash(newPassword, 12);
  await query('UPDATE `Users` SET `password` = ? WHERE `id` = ?', [hashed, id]);
  res.json({ message: 'Password reset successfully' });
});

// PATCH /api/users/me/change-password — any logged-in user changes their own password
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400); throw new Error('currentPassword and newPassword are required');
  }
  if (newPassword.length < 6) {
    res.status(400); throw new Error('New password must be at least 6 characters');
  }

  // Fetch with password hash
  const [row] = await query('SELECT * FROM `Users` WHERE `id` = ?', [req.user.id]);
  if (!row) { res.status(404); throw new Error('User not found'); }

  const match = await bcrypt.compare(currentPassword, row.password);
  if (!match) { res.status(401); throw new Error('Current password is incorrect'); }

  const hashed = await bcrypt.hash(newPassword, 12);
  await query('UPDATE `Users` SET `password` = ? WHERE `id` = ?', [hashed, req.user.id]);
  res.json({ message: 'Password changed successfully' });
});

// DELETE /api/users/:id — deactivate (soft delete) — Admin only
exports.deactivateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user.id) { res.status(400); throw new Error('Cannot deactivate your own account'); }
  await query('UPDATE `Users` SET `isActive` = 0 WHERE `id` = ?', [id]);
  res.json({ message: 'User deactivated' });
});
