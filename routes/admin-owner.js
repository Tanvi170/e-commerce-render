const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
require('dotenv').config(); // 👈 Load environment variables

// DB pool
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
// ✅ GET: Get summary dashboard counts
router.get('/summary', async (req, res) => {
  try {
    const [[{ total_stores }]] = await pool.query('SELECT COUNT(*) AS total_stores FROM stores');
    const [[{ total_customers }]] = await pool.query('SELECT COUNT(*) AS total_customers FROM customers');
    const [[{ total_products }]] = await pool.query('SELECT COUNT(*) AS total_products FROM products');
    const [[{ total_sales }]] = await pool.query('SELECT IFNULL(SUM(total_amount), 0) AS total_sales FROM orders');

    res.json({ total_stores, total_customers, total_products, total_sales });
  } catch (err) {
    console.error('Error fetching summary:', err.message);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ✅ GET: List of stores
router.get('/stores', async (req, res) => {
  const { search = '', status, sort = 'desc' } = req.query;

  const filters = [];
  const values = [];

  if (search) {
    filters.push(`(s.store_name LIKE ? OR u.email LIKE ?)`);
    values.push(`%${search}%`, `%${search}%`);
  }

  if (status && ['enabled', 'disabled'].includes(status)) {
    filters.push(`s.store_status = ?`);
    values.push(status);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const sql = `
    SELECT s.id, s.store_name, s.store_email, s.store_status, u.email AS owner_email
    FROM stores s
    JOIN users u ON s.id = u.store_id AND u.user_type = 'shop_owner'
    ${whereClause}
    ORDER BY s.id ${sort.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}
  `;

  try {
    const [results] = await pool.query(sql, values);
    res.json(results);
  } catch (err) {
    console.error('Error fetching store list:', err.message);
    res.status(500).json({ error: 'Failed to fetch stores' });
  }
});

// ✅ PUT: Update store status
router.put('/stores/:storeId/status', async (req, res) => {
  const { storeId } = req.params;
  const { status } = req.body;

  if (!['enabled', 'disabled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    await pool.query(`UPDATE stores SET store_status = ? WHERE id = ?`, [status, storeId]);
    res.json({ message: `Store ${status} successfully` });
  } catch (err) {
    console.error('Error updating store status:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
