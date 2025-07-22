require('dotenv').config(); // Load .env during development

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise'); // Use promise-based client

// ✅ Create a MySQL connection pool
const pool = mysql.createPool({
  host: process.env.MYSQL_ADDON_HOST || 'localhost',
  user: process.env.MYSQL_ADDON_USER || 'root',
  password: process.env.MYSQL_ADDON_PASSWORD || '',
  database: process.env.MYSQL_ADDON_DB || 'e-commerce-db',
  port: process.env.MYSQL_ADDON_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ✅ Route to get all customers (ID + Name)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT customer_id, customer_name FROM customers');
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching customers:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
