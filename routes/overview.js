require('dotenv').config();
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

// ✅ Create MySQL pool using environment variables (.env)
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

// ✅ GET: Overview analytics for a store
router.get('/:storeId', async (req, res) => {
  const { storeId } = req.params;

  try {
    // 1. Total Orders
    const [[orders]] = await pool.query(`
      SELECT COUNT(*) AS orders
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      WHERE c.store_id = ?
    `, [storeId]);

    // 2. Total Products Sold
    const [[sold]] = await pool.query(`
      SELECT SUM(quantity) AS productsSold
      FROM order_items
      WHERE store_id = ?
    `, [storeId]);

    // 3. Total Customers
    const [[customers]] = await pool.query(`
      SELECT COUNT(*) AS customers
      FROM customers
      WHERE store_id = ?
    `, [storeId]);

    // 4. Total Revenue
    const [[revenue]] = await pool.query(`
      SELECT SUM(o.total_amount) AS revenue
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      WHERE c.store_id = ?
    `, [storeId]);

    // 5. Top Selling Products
    const [topProducts] = await pool.query(`
      SELECT p.product_name, SUM(oi.quantity) AS sold
      FROM order_items oi
      JOIN products p ON oi.product_id = p.product_id
      WHERE oi.store_id = ?
      GROUP BY oi.product_id
      ORDER BY sold DESC
      LIMIT 5
    `, [storeId]);

    // 6. Pending Orders
    const [pendingOrders] = await pool.query(`
      SELECT o.order_id, o.total_amount, o.status, c.customer_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      WHERE c.store_id = ? AND o.status = 'Processing'
    `, [storeId]);

    // 7. Order Status Distribution
    const [orderStatusData] = await pool.query(`
      SELECT o.status, COUNT(*) AS count
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      WHERE c.store_id = ?
      GROUP BY o.status
    `, [storeId]);

    // 8. Daily Revenue Trend
    const [dailyRevenue] = await pool.query(`
      SELECT DATE(o.date_ordered) AS date, SUM(o.total_amount) AS revenue
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      WHERE c.store_id = ?
      GROUP BY DATE(o.date_ordered)
      ORDER BY DATE(o.date_ordered)
    `, [storeId]);

    // ✅ Respond with all analytics data
    res.json({
      orders: orders.orders || 0,
      productsSold: sold.productsSold || 0,
      customers: customers.customers || 0,
      revenue: revenue.revenue || 0,
      topProducts,
      pendingOrders,
      orderStatusData,
      dailyRevenue
    });

  } catch (err) {
    console.error("Overview route error:", err);
    res.status(500).json({ error: 'Could not fetch overview' });
  }
});

module.exports = router;
