require('dotenv').config(); // Load .env variables

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

// MySQL connection pool using .env variables
const pool = mysql.createPool({
  host: process.env.MYSQL_ADDON_HOST,
  user: process.env.MYSQL_ADDON_USER,
  password: process.env.MYSQL_ADDON_PASSWORD,
  database: process.env.MYSQL_ADDON_DB,
  port: process.env.MYSQL_ADDON_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// --- Signup Route (Plain-text password) ---
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required' });

  try {
    const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const [result] = await pool.query(
      'INSERT INTO users (email, password, user_type, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [email, password, 'customer']
    );

    res.status(201).json({
      message: 'User registered successfully!',
      userId: result.insertId,
      email
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// --- Login Route (Plain-text password match) ---
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required' });

  try {
    const [users] = await pool.query(
      'SELECT user_id, email, password, user_type, store_id FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0)
      return res.status(401).json({ message: 'Invalid credentials' });

    const user = users[0];

    if (password !== user.password)
      return res.status(401).json({ message: 'Invalid credentials' });

    // Generate JWT using env secret
    const token = jwt.sign(
      {
        user_id: user.user_id,
        store_id: user.store_id,
        user_type: user.user_type
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      message: 'Login successful!',
      user: {
        id: user.user_id,
        email: user.email,
        userType: user.user_type,
        storeId: user.store_id
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;
