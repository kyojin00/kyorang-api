module.exports = function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: "not logged in" });
  }
  next();
};
