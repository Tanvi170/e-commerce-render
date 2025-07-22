require('dotenv').config();
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

// DB connection pool for async/await
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

// ✅ GET /api/statistics?storeId=201 — Total stats
router.get('/', async (req, res) => {
  const storeId = req.query.storeId;
  if (!storeId) return res.status(400).json({ error: 'storeId is required' });

  const statsQuery = `
    SELECT 
      COUNT(*) AS total_orders,
      COALESCE(SUM(total_sale_amount), 0) AS total_sales,
      COALESCE(SUM(CASE WHEN sale_type = 'online' THEN total_sale_amount ELSE 0 END), 0) AS online_sales,
      COALESCE(SUM(CASE WHEN sale_type = 'offline' THEN total_sale_amount ELSE 0 END), 0) AS offline_sales
    FROM sales
    WHERE store_id = ?
  `;

  try {
    const [results] = await pool.query(statsQuery, [storeId]);
    res.json(results[0]);
  } catch (err) {
    console.error('🔴 Error fetching stats:', err.message);
    res.status(500).json({ error: 'Database error while fetching statistics' });
  }
});

// ✅ GET /api/statistics/by-date?storeId=201 — Daily sales by type
router.get('/by-date', async (req, res) => {
  const storeId = req.query.storeId;
  if (!storeId) return res.status(400).json({ error: 'storeId is required' });

  const sql = `
    SELECT 
      DATE_FORMAT(sale_date, '%Y-%m-%d') as date,
      sale_type,
      SUM(total_sale_amount) as total
    FROM sales
    WHERE store_id = ?
    GROUP BY date, sale_type
    ORDER BY date
  `;

  try {
    const [results] = await pool.query(sql, [storeId]);

    const online = {};
    const offline = {};

    results.forEach(row => {
      const date = row.date;
      const amount = Number(row.total);
      if (row.sale_type === 'online') online[date] = amount;
      if (row.sale_type === 'offline') offline[date] = amount;
    });

    res.json({ online, offline });
  } catch (err) {
    console.error('🔴 Error fetching sales by date:', err.message);
    res.status(500).json({ error: 'Database error while fetching sales by date' });
  }
});

module.exports = router;
