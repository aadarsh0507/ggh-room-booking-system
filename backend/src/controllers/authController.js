const User = require('../models/User');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

exports.register = asyncHandler(async (req, res) => {
  const { username, email, password, role } = req.body;

  const existing = await User.findByEmail(email);
  if (existing) {
    res.status(400);
    throw new Error('User already exists');
  }

  const user = await User.create({ username, email, password, role });

  if (user) {
    res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      token: generateToken(user.id),
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

exports.login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400); throw new Error('Username and password are required');
  }

  const user = await User.findByUsername(username, true);
  if (!user) {
    res.status(401); throw new Error('Invalid username or password');
  }
  if (!user.isActive) {
    res.status(403); throw new Error('Account is deactivated. Contact administrator.');
  }
  if (!(await User.comparePassword(password, user.password))) {
    res.status(401); throw new Error('Invalid username or password');
  }

  await User.updateLastLogin(user.id);
  res.json({
    id:       user.id,
    username: user.username,
    email:    user.email,
    role:     user.role,
    token:    generateToken(user.id),
  });
});

exports.getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user);
});
