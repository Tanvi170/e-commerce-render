const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const mysql = require("mysql2/promise");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

require('dotenv').config(); // ✅ Load env variables



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

router.post("/create-checkout-session", async (req, res) => {
  console.log("⚡️ Stripe route hit");
  const { products, customerId, storeId } = req.body;

  if (!customerId || !Array.isArray(products) || !storeId) {
    return res.status(400).json({ error: "Missing required data" });
  }

  let conn;

  try {
    const lineItems = products.map((product) => {
      const price = parseFloat(product.price);
      if (isNaN(price)) throw new Error(`Invalid price for product: ${product.product_name}`);

      const imageUrl = product.image?.replace(/\\/g, "/");
      const isValidImageUrl = imageUrl?.startsWith("http");

      return {
        price_data: {
          currency: "inr",
          product_data: {
            name: product.product_name,
            images: isValidImageUrl ? [imageUrl] : [],
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: product.quantity,
      };
    });

    const totalAmount = products.reduce(
      (sum, p) => sum + parseFloat(p.price) * p.quantity,
      0
    );

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [orderResult] = await conn.query(
      `INSERT INTO orders (customer_id, date_ordered, total_amount, status)
       VALUES (?, NOW(), ?, ?)`,
      [customerId, totalAmount, "Pending"]
    );

    const orderId = orderResult.insertId;

    const orderItems = products.map((p) => [
      orderId,
      p.product_id,
      p.quantity,
      storeId,
    ]);

    const placeholders = orderItems.map(() => "(?, ?, ?, ?)").join(", ");
    const values = orderItems.flat();

    await conn.query(
      `INSERT INTO order_items (order_id, product_id, quantity, store_id) VALUES ${placeholders}`,
      values
    );

    await conn.commit();

    const successUrl = encodeURI(`https://your-frontend-url.com/store/${storeId}/success`);
    const cancelUrl = encodeURI(`https://your-frontend-url.com/store/${storeId}/cart`);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    res.json({ id: session.id, orderId });

  } catch (err) {
    console.error("❌ Checkout Error:", err.message);
    if (conn) await conn.rollback();
    res.status(500).json({ error: "Checkout session creation failed" });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
