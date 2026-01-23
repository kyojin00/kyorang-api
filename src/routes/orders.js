const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAdmin } = require("../middleware/requireAdmin");



function requireLogin(req, res) {
  if (!req.session?.user?.id) {
    res.status(401).json({ ok: false, message: "로그인이 필요해요." });
    return false;
  }
  return true;
}

function makeOrderNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 1e6).toString().padStart(6, "0");
  return `KY${y}${m}${day}${rand}`;
}

router.post("/checkout", async (req, res) => {
  if (!requireLogin(req, res)) return;

  const userId = req.session.user.id;
  const {
    recipientName,
    phone,
    zipcode,
    address1,
    address2 = "",
    memo = "",
  } = req.body || {};

  if (!recipientName || !phone || !zipcode || !address1) {
    return res.status(400).json({ ok: false, message: "배송지 정보가 필요해요." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 0) userId -> cartId 조회 (일반적인 구조: carts(id, user_id))
    const [cartRows] = await conn.query(
      `SELECT id AS cartId FROM carts WHERE user_id = ? LIMIT 1`,
      [userId]
    );

    if (!cartRows.length) {
      await conn.rollback();
      return res.status(400).json({ ok: false, message: "장바구니가 비어있어요." });
    }

    const cartId = cartRows[0].cartId;

    // 1) cart(아이템) + products 조인
    // ✅ FOR UPDATE로 재고/수량 동시성 보호
    // ✅ sale_price 있으면 우선 적용 (없으면 price)
    const [items] = await conn.query(
      `
      SELECT
        ci.id AS cartItemId,
        ci.product_id AS productId,
        ci.quantity AS quantity,
        p.name AS productName,
        p.price AS price,
        p.sale_price AS salePrice,
        p.stock AS stock
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
      FOR UPDATE
      `,
      [cartId]
    );

    if (!items.length) {
      await conn.rollback();
      return res.status(400).json({ ok: false, message: "장바구니가 비어있어요." });
    }

    // 2) 재고 검증 + 금액 계산
    let itemsTotal = 0;
    for (const it of items) {
      const qty = Number(it.quantity);
      const stock = Number(it.stock);
      const unit = Number(it.salePrice ?? it.price);

      if (!Number.isFinite(qty) || qty <= 0) {
        await conn.rollback();
        return res.status(400).json({ ok: false, message: "수량이 올바르지 않아요." });
      }
      if (!Number.isFinite(stock) || stock < qty) {
        await conn.rollback();
        return res.status(409).json({
          ok: false,
          code: "OUT_OF_STOCK",
          message: `재고가 부족해요: ${it.productName}`,
          productId: it.productId,
        });
      }
      itemsTotal += unit * qty;
    }

    // 3) 배송비 정책(예시: 3만원 이상 무료)
    const shippingFee = itemsTotal >= 30000 ? 0 : 3000;
    const grandTotal = itemsTotal + shippingFee;

    // 4) 주문 생성
    const orderNo = makeOrderNo();
    const [orderResult] = await conn.query(
      `
      INSERT INTO orders
      (user_id, order_no, status, items_total, shipping_fee, grand_total,
       recipient_name, phone, zipcode, address1, address2, memo)
      VALUES
      (?, ?, 'PENDING', ?, ?, ?,
       ?, ?, ?, ?, ?, ?)
      `,
      [
        userId,
        orderNo,
        itemsTotal,
        shippingFee,
        grandTotal,
        recipientName,
        phone,
        zipcode,
        address1,
        address2,
        memo,
      ]
    );

    const orderId = orderResult.insertId;

    // 5) 주문 아이템 insert + 재고 차감
    for (const it of items) {
      const unit = Number(it.salePrice ?? it.price);
      const qty = Number(it.quantity);
      const lineTotal = unit * qty;

      await conn.query(
        `
        INSERT INTO order_items
        (order_id, product_id, product_name, unit_price, quantity, line_total)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [orderId, it.productId, it.productName, unit, qty, lineTotal]
      );

      await conn.query(
        `UPDATE products SET stock = stock - ? WHERE id = ?`,
        [qty, it.productId]
      );
    }

    // 6) 장바구니 비우기 (cart 테이블 기준)
    await conn.query(`DELETE FROM cart_items WHERE cart_id = ?`, [cartId]);

    await conn.commit();

    return res.json({
      ok: true,
      order: { orderNo, status: "PENDING", itemsTotal, shippingFee, grandTotal },
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    return res.status(500).json({ ok: false, message: "주문 생성 중 오류가 발생했어요." });
  } finally {
    conn.release();
  }
});

// GET /orders (내 주문 목록)
router.get("/", async (req, res) => {
  if (!requireLogin(req, res)) return;
  const userId = req.session.user.id;

  const [rows] = await pool.query(
    `
    SELECT order_no AS orderNo, status, grand_total AS grandTotal, created_at AS createdAt
    FROM orders
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
    `,
    [userId]
  );

  res.json({ ok: true, orders: rows });
});

// GET /orders/:orderNo (내 주문 상세)
router.get("/:orderNo", async (req, res) => {
  if (!requireLogin(req, res)) return;
  const userId = req.session.user.id;
  const { orderNo } = req.params;

  const [orders] = await pool.query(
    `
    SELECT *
    FROM orders
    WHERE user_id = ? AND order_no = ?
    LIMIT 1
    `,
    [userId, orderNo]
  );

  if (!orders.length) return res.status(404).json({ ok: false, message: "주문을 찾을 수 없어요." });

  const [items] = await pool.query(
    `
    SELECT product_id AS productId, product_name AS productName, unit_price AS unitPrice, quantity, line_total AS lineTotal
    FROM order_items
    WHERE order_id = ?
    ORDER BY id ASC
    `,
    [orders[0].id]
  );

  res.json({ ok: true, order: orders[0], items });
});

// POST /admin/orders/:orderNo/shipping
router.post("/admin/orders/:orderNo/shipping", requireAdmin, async (req, res) => {
  
  const { orderNo } = req.params;
  const courier = String(req.body?.courier ?? "").trim();
  const trackingNo = String(req.body?.trackingNo ?? "").trim();
  const autoShip = req.body?.autoShip !== false; // 기본 true

  if (!courier || !trackingNo) {
    return res.status(400).json({ message: "택배사(courier)와 송장번호(trackingNo)가 필요해요." });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 존재 확인
    const [rows] = await conn.query(
      "SELECT id, status FROM orders WHERE order_no = ? FOR UPDATE",
      [orderNo]
    );
    if (!rows || rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "주문을 찾을 수 없어요." });
    }

    // 업데이트
    if (autoShip) {
      await conn.query(
        `UPDATE orders
         SET courier = ?, tracking_no = ?, shipped_at = NOW(), status = 'SHIPPED'
         WHERE order_no = ?`,
        [courier, trackingNo, orderNo]
      );
    } else {
      await conn.query(
        `UPDATE orders
         SET courier = ?, tracking_no = ?, shipped_at = NOW()
         WHERE order_no = ?`,
        [courier, trackingNo, orderNo]
      );
    }
    
    await conn.commit();
    return res.json({
      ok: true,
      orderNo,
      courier,
      trackingNo,
      shippedAt: new Date().toISOString(),
      status: autoShip ? "SHIPPED" : rows[0].status,
    });
  } catch (e) {
    await conn.rollback();
    return res.status(500).json({ message: "송장 저장 중 오류가 발생했어요." });
  } finally {
    conn.release();
  }
  
});


module.exports = router;
