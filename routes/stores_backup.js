require('dotenv').config();
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// ✅ Create MySQL connection pool
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

// ✅ Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ✅ Multer setup
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const safeName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, safeName);
  }
});
const upload = multer({ storage });

// ✅ POST /api/stores_backup — Create new store
router.post('/stores_backup', upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'banner_image', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      store_name, slug, description, store_email, store_address,
      facebook, instagram, theme, primary_color,
      currency, timezone, business_type, password
    } = req.body;

    const [userRows] = await pool.query('SELECT user_id FROM users WHERE email = ?', [store_email]);
    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user_id = userRows[0].user_id;
    const hashedPassword = await bcrypt.hash(password, 10);

    const logo = req.files?.logo?.[0] ? `/uploads/${req.files.logo[0].filename}` : null;
    const banner_image = req.files?.banner_image?.[0] ? `/uploads/${req.files.banner_image[0].filename}` : null;

    const [result] = await pool.query(`
      INSERT INTO stores_backup (
        store_name, store_email, store_address,
        slug, description, facebook, instagram,
        theme, primary_color, logo, banner_image,
        currency, timezone, business_type,
        password, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [
      store_name, store_email, store_address,
      slug, description, facebook, instagram,
      theme, primary_color, logo, banner_image,
      currency, timezone, business_type,
      hashedPassword
    ]);

    const store_id = result.insertId;

    await pool.query('UPDATE users SET store_id = ? WHERE email = ?', [store_id, store_email]);

    res.status(201).json({ message: '✅ Store created and user updated', store_id });
  } catch (err) {
    console.error('❌ Store creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET /api/stores_backup — Get current user's store info
router.get('/api/stores_backup', async (req, res) => {
  const user = req.user; // From authenticateToken middleware
  if (!user || !user.store_id) {
    return res.status(400).json({ error: 'Invalid user or missing store_id' });
  }

  try {
    const [result] = await pool.query(
      'SELECT * FROM stores_backup WHERE store_id = ?',
      [user.store_id]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Store not found in backup table' });
    }

    res.json(result[0]);
  } catch (err) {
    console.error('❌ Error fetching store from stores_backup:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ GET /api/stores_backup/:id — Get store and products by ID
router.get('/stores_backup/:id', async (req, res) => {
  try {
    const storeId = req.params.id;

    const [storeRows] = await pool.query('SELECT * FROM stores_backup WHERE store_id = ?', [storeId]);
    if (storeRows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const [productRows] = await pool.query('SELECT * FROM products WHERE store_id = ?', [storeId]);

    res.json({
      store: storeRows[0],
      products: productRows
    });

  } catch (err) {
    console.error('❌ Error fetching store and products:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
