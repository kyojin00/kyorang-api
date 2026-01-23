function requireAdmin(req, res) {
  const u = req.session?.user;

  if (!u?.id) {
    res.status(401).json({ ok: false, message: "로그인이 필요해요." });
    return false;
  }
  if (u.role !== "ADMIN") {
    res.status(403).json({ ok: false, message: "관리자 권한이 필요해요." });
    return false;
  }
  return true;
}

module.exports = { requireAdmin };
