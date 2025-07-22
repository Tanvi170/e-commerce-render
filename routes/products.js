require('dotenv').config();
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ✅ MySQL pool connection using Render-compatible env vars
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

// ✅ Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// ✅ JWT Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) return res.status(401).json({ message: 'Token missing' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });

    req.user = decoded;
    next();
  });
}

// ✅ GET /api/products - All products + total sold
router.get('/', authenticateToken, async (req, res) => {
  const { store_id } = req.user;

  const query = `
    SELECT 
      p.*, 
      IFNULL(SUM(oi.quantity), 0) AS total_sold
    FROM 
      products p
    LEFT JOIN 
      order_items oi 
      ON p.product_id = oi.product_id AND oi.store_id = ?
    WHERE 
      p.store_id = ?
    GROUP BY 
      p.product_id
  `;

  try {
    const [results] = await pool.query(query, [store_id, store_id]);
    res.json(results);
  } catch (err) {
    console.error('Error fetching products with total_sold:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ✅ GET /api/products/categories
router.get('/categories', authenticateToken, async (req, res) => {
  const { store_id } = req.user;

  try {
    const [results] = await pool.query(
      `SELECT DISTINCT product_category AS name FROM products WHERE store_id = ?`,
      [store_id]
    );
    res.json(results);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ✅ GET /api/products/category-counts
router.get('/category-counts', authenticateToken, async (req, res) => {
  const { store_id } = req.user;

  try {
    const [results] = await pool.query(
      `SELECT product_category AS name, COUNT(product_id) AS count
       FROM products
       WHERE store_id = ?
       GROUP BY product_category`,
      [store_id]
    );
    res.json(results);
  } catch (err) {
    console.error('Error fetching category counts:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ✅ POST /api/products/add
router.post('/add', authenticateToken, upload.single('image'), async (req, res) => {
  const { product_name, price, product_category, description, stock_quantity } = req.body;
  const { store_id } = req.user;

  const image_url = req.file ? `uploads/${req.file.filename}` : null;
const query = `
  INSERT INTO products
  (product_name, store_id, description, price, stock_quantity, image_url, product_category)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

const values = [
  product_name,
  store_id,
  description,
  price,
  stock_quantity,
  image_url,
  product_category,
];


  try {
    await pool.query(query, values);
    res.status(201).json({ message: 'Product added successfully' });
  } catch (err) {
    console.error('Error inserting product:', err);
    res.status(500).json({ error: 'Failed to insert product' });
  }
});

// ✅ GET /api/products/filter - Filter by category, stock, price, sold qty, etc.
router.get('/filter', authenticateToken, async (req, res) => {
  const { store_id } = req.user;
  const { category, minPrice, maxPrice, inStock, search, startDate, endDate, minSold, maxSold } = req.query;

  let query = `
    SELECT 
      p.*, 
      IFNULL(SUM(oi.quantity), 0) AS total_sold
    FROM 
      products p
    LEFT JOIN 
      order_items oi 
      ON p.product_id = oi.product_id AND oi.store_id = ?
    WHERE 
      p.store_id = ?
  `;

  const params = [store_id, store_id];

  if (category && category !== 'All') {
    query += ` AND p.product_category = ?`;
    params.push(category);
  }

  if (minPrice) {
    query += ` AND p.price >= ?`;
    params.push(Number(minPrice));
  }

  if (maxPrice) {
    query += ` AND p.price <= ?`;
    params.push(Number(maxPrice));
  }

  if (inStock === 'true') {
    query += ` AND p.stock_quantity > 0`;
  }

  if (search) {
    query += ` AND p.product_name LIKE ?`;
    params.push(`%${search}%`);
  }

  if (startDate && endDate) {
    query += ` AND DATE(p.date_created) BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  }

  query += ` GROUP BY p.product_id`;

  if (minSold || maxSold) {
    query += ` HAVING 1`; // Dummy true condition
    if (minSold) {
      query += ` AND total_sold >= ?`;
      params.push(Number(minSold));
    }
    if (maxSold) {
      query += ` AND total_sold <= ?`;
      params.push(Number(maxSold));
    }
  }

  try {
    const [results] = await pool.query(query, params);
    res.json(results);
  } catch (err) {
    console.error('❌ Error filtering products:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
