// Wraps async route handlers so thrown errors propagate to Express's error middleware
// instead of becoming unhandled rejections.
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
