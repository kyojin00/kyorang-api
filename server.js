require("dotenv").config();
const app = require("./src/app");

const PORT = process.env.PORT || 3001;

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`API running on ${PORT}`);
});
