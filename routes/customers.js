require('dotenv').config(); // Load environment variables

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

// ✅ MySQL connection pool
const pool = mysql.createPool({
  host: process.env.MYSQL_ADDON_HOST || 'localhost',
  user: process.env.MYSQL_ADDON_USER || 'root',
  password: process.env.MYSQL_ADDON_PASSWORD || '',
  database: process.env.MYSQL_ADDON_DB || 'e-commerce-db',
  port: process.env.MYSQL_ADDON_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
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

// ✅ GET /api/customers
router.get('/', authenticateToken, async (req, res) => {
  const { store_id, user_type } = req.user;

  if (user_type !== 'shop_owner') {
    return res.status(403).json({ message: 'Access denied' });
  }

  const sql = `
    SELECT
      c.customer_id,
      c.customer_name,
      c.date_joined,
      c.phone_number,
      COUNT(DISTINCT o.order_id) AS no_of_orders,
      IFNULL(SUM(p.price * oi.quantity), 0) AS amount_spent
    FROM customers c
    LEFT JOIN orders o ON c.customer_id = o.customer_id
    LEFT JOIN order_items oi ON o.order_id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.product_id
    WHERE c.store_id = ?
    GROUP BY c.customer_id
    ORDER BY c.date_joined DESC;
  `;

  try {
    const [results] = await pool.query(sql, [store_id]);
    res.json(results);
  } catch (err) {
    console.error('❌ Error fetching customer data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ POST /api/customers/add
router.post('/add', authenticateToken, async (req, res) => {
  const { store_id } = req.user;
  const { customer_name, email, phone_number, address, password } = req.body;

  if (!customer_name || !email || !phone_number || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const sql = `
    INSERT INTO customers (customer_name, email, phone_number, address, password, date_joined, store_id)
    VALUES (?, ?, ?, ?, ?, NOW(), ?)
  `;

  const values = [customer_name, email, phone_number, address, password, store_id];

  try {
    const [result] = await pool.query(sql, values);
    res.status(201).json({ message: 'Customer added successfully' });
  } catch (err) {
    console.error('❌ Error inserting customer:', err);
    res.status(500).json({ error: 'Database insert failed' });
  }
});

// ✅ GET /api/customers/:id
router.get('/:id', authenticateToken, async (req, res) => {
  const customerId = req.params.id;

  const sql = `
    SELECT customer_id AS id, customer_name AS name, email, phone_number AS phone, address, date_joined 
    FROM customers 
    WHERE customer_id = ?
  `;

  try {
    const [results] = await pool.query(sql, [customerId]);

    if (results.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json(results[0]);
  } catch (err) {
    console.error('❌ Error fetching customer:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
