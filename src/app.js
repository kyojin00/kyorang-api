const express = require("express");
const session = require("express-session");

const authRouter = require("./routes/auth");
const productsRouter = require("./routes/products");
const cartRouter = require("./routes/cart");

const app = express();

/** ✅ 프록시 뒤에 있을 때 필수 (nginx) */
app.set("trust proxy", 1);

/** ✅ 1) CORS (제일 먼저) */
const allowed = new Set([
  "http://localhost:3000",
  "http://192.168.0.122:3000",
  "https://kyorang.shop",
  "https://www.kyorang.shop",
  "http://127.0.0.1:3000",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
  }

  // ✅ preflight 요청은 여기서 종료
  if (req.method === "OPTIONS") return res.sendStatus(204);

  next();
});

/** ✅ 2) JSON 파서 */
app.use(express.json());


// app.use(
//   session({
//     name: "kyorang.sid",
//     secret: "dev-secret-change-me",
//     resave: false,

//     // 🔥 핵심
//     saveUninitialized: true,

//     cookie: {
//       httpOnly: true,
//       secure: false,        // ❗ 개발환경
//       sameSite: "lax",      // ❗ 동일 사이트
//       maxAge: 1000 * 60 * 60 * 24 * 7,
//     },
//   })
// );


/** ✅ 3) 세션 */
app.use(
  session({
    name: "kyorang.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    proxy: true, // ✅ 추가
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);


/** ✅ 4) 라우터 */
app.use("/auth", authRouter);
app.use("/products", productsRouter);
app.use("/cart", cartRouter);

module.exports = app;

