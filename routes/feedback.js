require('dotenv').config(); // Load environment variables

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

// ✅ MySQL connection pool (Render-compatible)
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

// ✅ Middleware to verify JWT and attach user info
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer <token>

  if (!token) return res.status(401).json({ message: 'Token missing' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });

    req.user = decoded; // contains user_id, store_id, user_type
    next();
  });
}

// ✅ GET /api/feedback - fetch feedback for shop owner's store
router.get('/', authenticateToken, async (req, res) => {
  const { store_id, user_type } = req.user;

  if (user_type !== 'shop_owner') {
    return res.status(403).json({ message: 'Access denied' });
  }

  const sql = `
    SELECT 
      f.feedback_id, 
      f.review_date, 
      f.rating, 
      f.review_description, 
      c.customer_name, 
      p.product_name
    FROM feedback f
    JOIN customers c ON f.customer_id = c.customer_id
    JOIN products p ON f.product_id = p.product_id
    WHERE f.store_id = ?
    ORDER BY f.review_date DESC
  `;

  try {
    const [results] = await pool.query(sql, [store_id]);
    res.json(results);
  } catch (err) {
    console.error('🔴 Error fetching feedback:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
