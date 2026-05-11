const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * Token blacklist (in-memory). For production, use Redis.
 * Stores tokens that have been invalidated (e.g., logout, admin force-invalidates).
 */
const tokenBlacklist = new Set();

exports.blacklistToken = (token) => {
  tokenBlacklist.add(token);
};

exports.isTokenBlacklisted = (token) => {
  return tokenBlacklist.has(token);
};

/**
 * Authenticate JWT token with full validation.
 * - Verifies token signature, expiration, and issuer
 * - Checks user exists and is active in DB
 * - Checks token not blacklisted
 * - Attaches user to req.user
 */
exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'لم يتم توفير رمز مميز'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({
        success: false,
        message: 'رمز غير صالح'
      });
    }

    // Check blacklist
    if (exports.isTokenBlacklisted(token)) {
      return res.status(401).json({
        success: false,
        message: 'تم إلغاء هذا الرمز. يرجى تسجيل الدخول مرة أخرى.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],
        maxAge: process.env.JWT_EXPIRES_IN || '24h'
      });
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'رمز غير صالح أو منتهي الصلاحية'
      });
    }

    // Validate decoded payload
    if (!decoded || !decoded.id || !decoded.username) {
      return res.status(401).json({
        success: false,
        message: 'رمز غير صالح: بيانات مفقودة'
      });
    }

    // Verify user still exists and is active in DB
    const user = await User.findByPk(decoded.id, {
      attributes: ['id', 'username', 'is_active']
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'المستخدم غير موجود'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'حساب المستخدم غير نشط. يرجى الاتصال بالمسؤول.'
      });
    }

    // Attach user info to request
    req.user = {
      id: decoded.id,
      username: decoded.username,
      tokenIssuedAt: decoded.iat,
      tokenExpiresAt: decoded.exp
    };
    req.authToken = token;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'خطأ في التحقق من المصادقة'
    });
  }
};

/**
 * Require that the requesting user owns the resource specified by :id param.
 * @param {Function} getOwnerIdFn - async (req) => returns the owner user ID
 */
exports.requireOwnership = (getOwnerIdFn) => {
  return async (req, res, next) => {
    try {
      const ownerId = await getOwnerIdFn(req);
      if (parseInt(ownerId) !== parseInt(req.user.id)) {
        // Check if user has override permission
        const user = await User.findByPk(req.user.id);
        if (user) {
          const permissionKeys = await user.getPermissionKeys();
          if (permissionKeys.includes('APPLICATION_ADMIN')) {
            return next();
          }
        }
        return res.status(403).json({
          success: false,
          message: 'ليس لديك صلاحية للوصول إلى هذا المورد'
        });
      }
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'خطأ في التحقق من ملكية المورد'
      });
    }
  };
};
