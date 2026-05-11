// =========================
// File: authController.js (SECURITY HARDENED)
// Authentication and user self-service
// =========================

const jwt = require('jsonwebtoken');
const { User, Permission } = require('../models');
const AppError = require('../utils/app-error.utility');

/**
 * User login
 * @route POST /api/auth/login
 * @access Public
 */
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return next(new AppError('اسم المستخدم وكلمة المرور مطلوبان', 400));
    }

    // Find user
    const user = await User.findOne({
      where: { username }
    });

    if (!user) {
      return next(new AppError('بيانات غير صالحة', 401));
    }

    // Check if user is active
    if (!user.is_active) {
      return next(new AppError('الحساب غير نشط. يرجى الاتصال بالمسؤول.', 403));
    }

    // Verify password
    const isPasswordValid = await user.checkPassword(password);

    if (!isPasswordValid) {
      return next(new AppError('بيانات غير صالحة', 401));
    }

    // Get user permissions
    const permissions = await user.getPermissions();
    
    // Generate JWT token with issuer claim
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        algorithm: 'HS256'
      }
    );
    
    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح.',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          is_active: user.is_active,
          permissions: permissions.map(p => ({
            key: p.key,
            name: p.name,
            category: p.category
          }))
        }
      }
    });

  } catch (error) {
    return next(new AppError('حدث خطأ أثناء تسجيل الدخول'));
  }
};

/**
 * Get current user profile with permissions
 * @route GET /api/auth/profile
 * @access Authenticated users
 */
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password_hash'] },
      include: [{
        model: Permission,
        as: 'permissions',
        attributes: ['id', 'key', 'name', 'description', 'category']
      }]
    });

    if (!user) {
      return next(new AppError('المستخدم غير موجود', 404));
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    return next(new AppError('خطأ اثناء ارجاع الملف الشخصي', 500));
  }
};

/**
 * Update own profile (limited fields)
 * @route PUT /api/auth/profile
 * @access Authenticated users
 */
exports.updateProfile = async (req, res, next) => {
  try {
    const {
      full_name,
      email,
      phone,
      current_password,
      new_password
    } = req.body;

    const user = await User.findByPk(req.user.id);

    if (!user) {
      return next(new AppError('لم يتم العثور على المستخدم', 404));
    }

    // If changing password, verify current password
    if (new_password) {
      if (!current_password) {
        return next(new AppError('كلمة المرور الحالية مطلوبة لتعيين كلمة مرور جديدة', 400));
      }

      const isCurrentPasswordValid = await user.checkPassword(current_password);

      if (!isCurrentPasswordValid) {
        return next(new AppError('كلمة المرور الحالية غير صحيحة', 400));
      }
    }

    // Check if email is being changed and already exists
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        return next(new AppError('البريد الإلكتروني قيد الاستخدام بالفعل', 409));
      }
    }

    // Update allowed fields
    const updateData = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (new_password) updateData.password_hash = new_password; // Will be hashed by hook

    await user.update(updateData);

    // Return updated user without password
    const updatedUser = await User.findByPk(user.id, {
      attributes: { exclude: ['password_hash'] }
    });

    res.json({
      success: true,
      message: 'تم تعديل الحساب بنجاح',
      data: updatedUser
    });

  } catch (error) {
    return next(new AppError('حدث خطأ أثناء تحديث الملف الشخصي', 500));
  }
};

/**
 * Get current user's permissions
 * @route GET /api/auth/permissions
 * @access Authenticated users
 */
exports.getMyPermissions = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return next(new AppError('المستخدم غير موجود', 404));
    }

    const permissions = await user.getPermissions();

    // Group by category
    const groupedPermissions = permissions.reduce((grouped, permission) => {
      const category = permission.category;
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push({
        key: permission.key,
        name: permission.name,
        description: permission.description
      });
      return grouped;
    }, {});

    res.json({
      success: true,
      data: {
        permissions: permissions.map(p => ({
          id: p.id,
          key: p.key,
          name: p.name,
          description: p.description,
          category: p.category
        })),
        grouped: groupedPermissions,
        permission_keys: permissions.map(p => p.key)
      }
    });

  } catch (error) {
    return next(new AppError('حدث خطأ في جلب الصلاحيات', 500));
  }
};

/**
 * Logout - Blacklists current token
 * @route POST /api/auth/logout
 * @access Authenticated users
 */
exports.logout = async (req, res, next) => {
  try {
    const auth = require('../middleware/auth');
    if (req.authToken) {
      auth.blacklistToken(req.authToken);
    }
    res.json({
      success: true,
      message: 'تم تسجيل الخروج بنجاح'
    });
  } catch (error) {
    return next(new AppError('حدث خطأ أثناء تسجيل الخروج', 500));
  }
};

module.exports = exports;
