// adminOrders.js
const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAdmin } = require("../middleware/requireAdmin");

// ✅ 관리자 주문 목록
router.get("/", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { status = "" } = req.query;
  const params = [];
  let where = "";
  if (status && String(status).trim()) {
    where = "WHERE o.status = ?";
    params.push(String(status).trim());
  }

  const [rows] = await pool.query(
    `
    SELECT
      o.order_no AS orderNo,
      o.status,
      o.grand_total AS grandTotal,
      o.created_at AS createdAt,
      o.recipient_name AS recipientName,
      o.phone,
      o.zipcode,
      o.address1,
      o.address2
    FROM orders o
    ${where}
    ORDER BY o.created_at DESC
    LIMIT 200
    `,
    params
  );

  res.json({ ok: true, orders: rows });
});

// ✅ 관리자 주문 상세 (추가)
router.get("/:orderNo", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { orderNo } = req.params;

  const [orders] = await pool.query(
    `
    SELECT
      o.*,
      u.email AS user_email,
      u.name  AS user_name
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.order_no = ?
    LIMIT 1
    `,
    [orderNo]
  );

  if (!orders.length) {
    return res.status(404).json({ ok: false, message: "주문을 찾을 수 없어요." });
  }

  const order = orders[0];

  const [items] = await pool.query(
    `
    SELECT
      product_id   AS productId,
      product_name AS productName,
      unit_price   AS unitPrice,
      quantity,
      line_total   AS lineTotal
    FROM order_items
    WHERE order_id = ?
    ORDER BY id ASC
    `,
    [order.id]
  );

  res.json({ ok: true, order, items });
});

// ✅ 상태 변경
async function changeStatus(req, res) {
  console.log("method:", req.method);
  console.log("orderNo param:", req.params.orderNo);
  console.log("session user:", req.session?.user);

  if (!requireAdmin(req, res)) return;

  const { orderNo } = req.params;
  const { status, note } = req.body || {};

  const allowed = new Set(["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELED", "REFUNDED"]);
  const next = String(status || "").trim();

  if (!allowed.has(next)) {
    return res.status(400).json({ ok: false, message: "잘못된 상태값이에요." });
  }

  // 1) 현재 상태 읽기 (로그의 from_status 용)
  const [rows] = await pool.query(
    `SELECT id, order_no, status FROM orders WHERE order_no = ? LIMIT 1`,
    [orderNo]
  );

  if (!rows.length) {
    return res.status(404).json({ ok: false, message: "주문을 찾을 수 없어요." });
  }

  const order = rows[0];
  const fromStatus = String(order.status);

  // 같은 값이면 굳이 변경/로그 남기지 않음(원하면 로그 남기도록 바꿔도 됨)
  if (fromStatus === next) {
    return res.json({ ok: true, unchanged: true });
  }

  // 2) 업데이트
  const [result] = await pool.query(
    `UPDATE orders SET status = ? WHERE order_no = ?`,
    [next, orderNo]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ ok: false, message: "주문을 찾을 수 없어요." });
  }

  // 3) 로그 INSERT
  const actor = req.session?.user || null;
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;
  const ua = req.headers["user-agent"]?.toString().slice(0, 255) || null;

  await pool.query(
    `
    INSERT INTO order_status_logs
      (order_id, order_no, from_status, to_status,
       actor_user_id, actor_email, actor_role,
       note, ip, user_agent)
    VALUES
      (?, ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?)
    `,
    [
      order.id,
      order.order_no,
      fromStatus,
      next,
      actor?.id ?? null,
      actor?.email ?? null,
      actor?.role ?? null,
      note ? String(note).slice(0, 255) : null,
      ip,
      ua,
    ]
  );

  console.log("affected:", result.affectedRows);
  return res.json({ ok: true, from: fromStatus, to: next });
}

// POST도 받고(목록 페이지), PATCH도 받고(상세 페이지) 둘 다 changeStatus로 처리
router.post("/:orderNo/status", changeStatus);
router.patch("/:orderNo/status", changeStatus);



module.exports = router;
