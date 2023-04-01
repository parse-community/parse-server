module.exports = function (req, res, next) {
  res.set('X-Yolo', '1');
  next();
};
