const express = require("express");
const { pool } = require("../db");

const router = express.Router();

/**
 * GET /products?featured=1
 */
router.get("/", async (req, res) => {
  try {
    const featured = String(req.query.featured || "") === "1";

    const where = ["p.status = 'ACTIVE'"];
    if (featured) where.push("p.is_featured = 1");

    const sql = `
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
    `;

    const [rows] = await pool.query(sql);
    return res.json({ items: rows });
  } catch (e) {
    console.error("PRODUCTS LIST ERROR:", {
      message: e?.message,
      code: e?.code,
      sqlMessage: e?.sqlMessage,
      stack: e?.stack,
    });
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * GET /products/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "invalid id" });
    }

    const sql = `
      SELECT
        p.id, p.category_id, p.sku, p.name, p.description,
        p.price, p.sale_price, p.stock, p.status, p.is_featured,
        p.thumbnail_url, p.created_at, p.updated_at,
        c.name AS category_name, c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
      LIMIT 1
    `;

    const [rows] = await pool.query(sql, [id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "not found" });
    }

    return res.json({ item: rows[0] });
  } catch (e) {
    console.error("PRODUCT DETAIL ERROR:", {
      message: e?.message,
      code: e?.code,
      sqlMessage: e?.sqlMessage,
      stack: e?.stack,
    });
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;

