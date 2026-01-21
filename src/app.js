const express = require("express");
const session = require("express-session");
const cors = require("cors");

const authRouter = require("./routes/auth");
const productsRouter = require("./routes/products");
const cartRouter = require("./routes/cart");

const app = express();

/** ✅ 1) CORS는 무조건 제일 먼저 */
const allowed = new Set([
  "http://192.168.0.122:3000",
  "http://localhost:3000",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowed.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
  }

  // ✅ preflight는 여기서 바로 종료(핵심)
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/** ✅ 2) 그 다음에 파서/세션 */
app.use(express.json());

app.use(
  session({
    name: "kyorang.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // 로컬/IP 개발
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

/** ✅ 3) 라우터 */
app.use("/auth", authRouter);
app.use("/products", productsRouter);
app.use("/cart", cartRouter);

module.exports = app;
