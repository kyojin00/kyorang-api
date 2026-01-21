const express = require("express");
const { pool } = require("../db");

const router = express.Router();

// GET /products?featured=1
router.get("/", async (req, res) => {
  try {
    const featured = req.query.featured === "1";

    const where = ["p.status='ACTIVE'"];
    if (featured) where.push("p.is_featured=1");

    const [rows] = await pool.query(
      `
      SELECT
        p.id, p.category_id, p.sku, p.name, p.description,
        p.price, p.sale_price, p.stock, p.status, p.is_featured,
        p.thumbnail_url, p.created_at, p.updated_at,
        c.name AS category_name, c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.is_featured DESC, p.id DESC
      LIMIT 60
      `
    );

    res.json({ items: rows });
  } catch (e) {
    console.error("PRODUCTS LIST ERROR:", e);
    res.status(500).json({ message: "server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(
      `
      SELECT
        p.id, p.category_id, p.sku, p.name, p.description,
        p.price, p.sale_price, p.stock, p.status, p.is_featured,
        p.thumbnail_url, p.created_at, p.updated_at,
        c.name AS category_name, c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id=?
      LIMIT 1
      `,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "not found" });
    res.json({ item: rows[0] });
  } catch (e) {
    console.error("PRODUCT DETAIL ERROR:", e);
    res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
