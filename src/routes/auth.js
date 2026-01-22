const express = require("express");
const bcrypt = require("bcrypt");
const { pool } = require("../db");

const router = express.Router();

function normalizeEmail(v) {
  return String(v ?? "").trim().toLowerCase();
}
function normalizeText(v) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

/** 회원가입 */
router.post("/register", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    const name = normalizeText(req.body?.name);

    // ✅ 필수/형식 검증 (MVP)
    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "email, password required" });
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return res.status(400).json({ ok: false, message: "invalid email" });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ ok: false, message: "invalid password length" });
    }

    // ✅ (선택) 미리 중복 체크: UX 용도 (그래도 ER_DUP_ENTRY는 꼭 잡아야 함)
    const [exists] = await pool.query("SELECT id FROM users WHERE email=? LIMIT 1", [email]);
    if (exists.length) {
      return res.status(409).json({ ok: false, message: "email exists" });
    }

    const hash = await bcrypt.hash(password, 12);

    // ✅ INSERT (users.email UNIQUE 전제)
    await pool.query(
      "INSERT INTO users (email, password_hash, name, role, status) VALUES (?,?,?,?,?)",
      [email, hash, name, "USER", "ACTIVE"]
    );

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("REGISTER ERROR:", err);

    // ✅ 동시 가입 등으로 UNIQUE 충돌
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "email exists" });
    }

    return res.status(500).json({ ok: false, message: "server error" });
  }
});

/** 로그인 */
router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");

    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "email, password required" });
    }

    // ✅ 필요한 컬럼만
    const [rows] = await pool.query(
      "SELECT id, email, password_hash, role, name FROM users WHERE email=? LIMIT 1",
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, message: "login failed" });
    }

    const user = rows[0];

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, message: "login failed" });
    }

    if (!req.session) {
      return res.status(500).json({ ok: false, message: "session not initialized" });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    return res.json({ ok: true, user: req.session.user });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ ok: false, message: "server error" });
  }
});

/** 로그인 확인 */
router.get("/me", (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ ok: false, message: "not logged in" });
  }
  return res.json({ ok: true, user: req.session.user });
});

/** 로그아웃 */
router.post("/logout", (req, res) => {
  const isProd = process.env.NODE_ENV === "production";

  // ✅ path/domain은 "쿠키를 설정할 때"와 동일해야 확실히 삭제됨
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/", // ✅ 중요
    // domain: isProd ? ".kyorang.shop" : undefined, // 쿠키 설정 시 domain을 썼다면 여기도 동일하게
  };

  if (!req.session) {
    res.clearCookie("kyorang.sid", cookieOptions);
    return res.json({ ok: true });
  }

  req.session.destroy(() => {
    res.clearCookie("kyorang.sid", cookieOptions);
    res.json({ ok: true });
  });
});

module.exports = router;
