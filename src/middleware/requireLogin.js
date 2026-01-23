function requireLogin(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(401).json({ ok: false, message: "로그인이 필요해요." });
  }
  next();
}

module.exports = { requireLogin };
