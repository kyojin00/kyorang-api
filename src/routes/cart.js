const express = require("express");
const { pool } = require("../db");
const requireLogin = require("../middlewares/requireLogin");

const router = express.Router();

// 유저의 cart_id 가져오기 (없으면 생성)
async function getOrCreateCartId(userId) {
  const [rows] = await pool.query("SELECT id FROM carts WHERE user_id=?", [userId]);
  if (rows.length) return rows[0].id;

  const [result] = await pool.query("INSERT INTO carts (user_id) VALUES (?)", [userId]);
  return result.insertId;
}

/**
 * GET /cart
 * 장바구니 조회 (아이템 + 상품 정보)
 */
router.get("/", requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const cartId = await getOrCreateCartId(userId);

    const [items] = await pool.query(
      `
      SELECT
        ci.id AS cart_item_id,
        ci.quantity,
        p.id AS product_id,
        p.name,
        p.price,
        p.sale_price,
        p.stock,
        p.thumbnail_url
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
      ORDER BY ci.id DESC
      `,
      [cartId]
    );

    res.json({ cartId, items });
  } catch (e) {
    console.error("CART GET ERROR:", e);
    res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /cart/items
 * body: { productId, quantity? }
 * 같은 상품이면 수량 누적
 */
router.post("/items", requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const cartId = await getOrCreateCartId(userId);

    const productId = Number(req.body.productId);
    const qty = Math.max(1, Number(req.body.quantity || 1));

    if (!Number.isFinite(productId)) {
      return res.status(400).json({ message: "productId required" });
    }

    // 상품 존재/재고 확인
    const [[product]] = await pool.query(
      "SELECT id, stock, status FROM products WHERE id=? LIMIT 1",
      [productId]
    );
    if (!product) return res.status(404).json({ message: "product not found" });
    if (product.status !== "ACTIVE") return res.status(400).json({ message: "product inactive" });

    // 기존 아이템 있는지 확인
    const [[exists]] = await pool.query(
      "SELECT id, quantity FROM cart_items WHERE cart_id=? AND product_id=? LIMIT 1",
      [cartId, productId]
    );

    const newQty = exists ? exists.quantity + qty : qty;

    // 재고보다 많이 못 담게(선택)
    if (product.stock < newQty) {
      return res.status(400).json({ message: "not enough stock" });
    }

    if (exists) {
      await pool.query(
        "UPDATE cart_items SET quantity=? WHERE id=?",
        [newQty, exists.id]
      );
    } else {
      await pool.query(
        "INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,?)",
        [cartId, productId, newQty]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("CART ADD ERROR:", e);
    res.status(500).json({ message: "server error" });
  }
});

/**
 * PATCH /cart/items/:cartItemId
 * body: { quantity }
 */
router.patch("/items/:cartItemId", requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const cartId = await getOrCreateCartId(userId);

    const cartItemId = Number(req.params.cartItemId);
    const qty = Number(req.body.quantity);

    if (!Number.isFinite(cartItemId) || !Number.isFinite(qty)) {
      return res.status(400).json({ message: "invalid input" });
    }

    if (qty <= 0) {
      await pool.query(
        "DELETE FROM cart_items WHERE id=? AND cart_id=?",
        [cartItemId, cartId]
      );
      return res.json({ ok: true });
    }

    // 재고 체크
    const [[row]] = await pool.query(
      `
      SELECT ci.product_id, p.stock
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.id=? AND ci.cart_id=?
      LIMIT 1
      `,
      [cartItemId, cartId]
    );
    if (!row) return res.status(404).json({ message: "cart item not found" });
    if (row.stock < qty) return res.status(400).json({ message: "not enough stock" });

    await pool.query(
      "UPDATE cart_items SET quantity=? WHERE id=? AND cart_id=?",
      [qty, cartItemId, cartId]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("CART PATCH ERROR:", e);
    res.status(500).json({ message: "server error" });
  }
});

/**
 * DELETE /cart/items/:cartItemId
 */
router.delete("/items/:cartItemId", requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const cartId = await getOrCreateCartId(userId);

    const cartItemId = Number(req.params.cartItemId);
    if (!Number.isFinite(cartItemId)) return res.status(400).json({ message: "invalid id" });

    await pool.query(
      "DELETE FROM cart_items WHERE id=? AND cart_id=?",
      [cartItemId, cartId]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("CART DELETE ERROR:", e);
    res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
