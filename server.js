// /var/www/kyorang-api/server.js
const path = require("path");

// ✅ dotenv를 가장 먼저 로드 (app/db 보다 먼저!)
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = require("./src/app");

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "127.0.0.1";

app.listen(PORT, HOST, () => {
  console.log(`kyorang-api listening on http://${HOST}:${PORT}`);
});

