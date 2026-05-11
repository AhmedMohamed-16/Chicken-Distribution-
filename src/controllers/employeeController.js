// src/controllers/employeeController.js
const { Employee } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../utils/app-error.utility');

// ========================================
// GET ALL EMPLOYEES
// GET /api/employees?active=true|false
// ========================================
exports.getAllEmployees = async (req, res, next) => {
  try {
    const where = {};

    if (req.query.active === 'true') {
      where.is_active = true;
    } else if (req.query.active === 'false') {
      where.is_active = false;
    }

    const employees = await Employee.findAll({
      where,
      order: [['name', 'ASC']]
    });

    return res.json({
      success: true,
      data: employees
    });
  } catch (error) {
    return next(new AppError('حدث خطأ أثناء جلب الموظفين', 500));
  }
};

// ========================================
// GET EMPLOYEE BY ID
// GET /api/employees/:id
// ========================================
exports.getEmployeeById = async (req, res, next) => {
  try {
    const employee = await Employee.findByPk(req.params.id);

    if (!employee) {
      return next(new AppError('الموظف غير موجود', 404));
    }

    return res.json({
      success: true,
      data: employee
    });
  } catch (error) {
    return next(new AppError('حدث خطأ أثناء جلب بيانات الموظف', 500));
  }
};

// ========================================
// CREATE EMPLOYEE
// POST /api/employees
// ========================================
exports.createEmployee = async (req, res, next) => {
  try {
    const { name, phone, role, is_active } = req.body;

    if (!name || !name.trim()) {
      return next(new AppError('اسم الموظف مطلوب', 400));
    }

    const employee = await Employee.create({
      name:        name.trim(),
      phone:       phone       || null,
      role:        role        || null,
      is_active:   is_active !== undefined ? is_active : true
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الموظف بنجاح',
      data: employee
    });
  } catch (error) {
    // Sequelize validation errors
    if (error.name === 'SequelizeValidationError') {
      return next(new AppError(error.errors[0].message, 400));
    }
    return next(new AppError('حدث خطأ أثناء إنشاء الموظف', 500));
  }
};

// ========================================
// UPDATE EMPLOYEE
// PUT /api/employees/:id
// ========================================
exports.updateEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findByPk(req.params.id);

    if (!employee) {
      return next(new AppError('الموظف غير موجود', 404));
    }

    const { name, phone, role, is_active } = req.body;

    // Validate name if provided
    if (name !== undefined && (!name || !name.trim())) {
      return next(new AppError('اسم الموظف لا يمكن أن يكون فارغاً', 400));
    }

    const updateData = {};
    if (name       !== undefined) updateData.name        = name.trim();
    if (phone      !== undefined) updateData.phone        = phone || null;
    if (role       !== undefined) updateData.role         = role || null;
    if (is_active  !== undefined) updateData.is_active    = is_active;

    await employee.update(updateData);

    return res.json({
      success: true,
      message: 'تم تحديث بيانات الموظف بنجاح',
      data: employee
    });
  } catch (error) {
    if (error.name === 'SequelizeValidationError') {
      return next(new AppError(error.errors[0].message, 400));
    }
    return next(new AppError('حدث خطأ أثناء تحديث بيانات الموظف', 500));
  }
};

// ========================================
// SOFT DELETE EMPLOYEE
// DELETE /api/employees/:id  → sets is_active = false
// ========================================
exports.deleteEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findByPk(req.params.id);

    if (!employee) {
      return next(new AppError('الموظف غير موجود', 404));
    }

    if (!employee.is_active) {
      return next(new AppError('الموظف غير نشط بالفعل', 400));
    }

    await employee.update({ is_active: false });

    return res.json({
      success: true,
      message: 'تم تعطيل الموظف بنجاح'
    });
  } catch (error) {
    return next(new AppError('حدث خطأ أثناء حذف الموظف', 500));
  }
};

module.exports = exports;
