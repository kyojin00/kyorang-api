const express = require("express");
const bcrypt = require("bcrypt");
const { pool } = require("../db");

const router = express.Router();

/** 회원가입 */
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ message: "invalid input" });
  }

  const [exists] = await pool.query(
    "SELECT id FROM users WHERE email=?",
    [email]
  );
  if (exists.length) {
    return res.status(409).json({ message: "email exists" });
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    "INSERT INTO users (email, password_hash, name) VALUES (?,?,?)",
    [email, hash, name || null]
  );

  res.json({ ok: true });
});

/** 로그인 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email=?",
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "login failed" });
    }

    const user = rows[0];

    if (!user.password_hash) {
      return res.status(500).json({ message: "password_hash column missing" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "login failed" });
    }

    if (!req.session) {
      return res.status(500).json({ message: "session not initialized" });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    res.json({ ok: true, user: req.session.user });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "server error", detail: String(err) });
  }
});


/** 로그인 확인 */
router.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "not logged in" });
  }
  res.json({ user: req.session.user });
});

/** 로그아웃 */
router.post("/logout", (req, res) => {
  const isProd = process.env.NODE_ENV === "production";
  req.session.destroy(() => {
    res.clearCookie("kyorang.sid", {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
    });
    res.json({ ok: true });
  });
});


module.exports = router;
