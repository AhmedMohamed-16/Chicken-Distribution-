# 🐔 Chicken Distribution & Sales Management System

## 🎯 Project Goal
A real-world financial & operational system for managing daily chicken distribution:
- Purchasing from multiple farms
- Transporting with losses
- Selling to buyers
- Tracking debts
- Calculating daily & period profits
- Distributing profits among partners with special vehicle-cost rules

This is NOT a demo toy system.
It is a production-style accounting & operations system.

---

## 🧠 Business Summary
- Partners invest with different percentages
- Some partners invest in vehicles, others do not
- Vehicle costs affect partners differently
- Daily operation = 1 vehicle + multiple farms + multiple buyers
- Accurate weight-based accounting is critical
- Partial payments and old debts are core features

---

## 🏗 Tech Stack
### Backend
- Node.js
- Express
- PostgreSQL
- ORM: (Sequelize / Prisma – already chosen in repo)
- JWT Authentication
- Clean Architecture (Controller → Service → Repository)

### Frontend
- Angular
- Angular Material
- Arabic RTL-first UI
- Role-based access

---

## 📐 Architecture Rules (DO NOT BREAK)
- No business logic inside controllers
- All calculations inside services
- Database access only through repositories
- Use DECIMAL for all financial values
- No floating-point math
- Preserve naming conventions

---

## 🗂 Current Repository Status

### ✅ Already Implemented
- Database schema (ERD finalized)
- Core entities/models
- Authentication basics
- Major services structure
- Daily operation core logic
- Profit calculation logic (service)

### ❌ Missing / Incomplete Files
The following files MUST be implemented next **without redesigning anything**:

- migrate.js → Database migrations runner
- seed.js → Initial seed data (admin, partners, vehicles, farms, buyers)
- buyerController.js → Buyers CRUD + debt history
- server.js → App bootstrap & server startup

---

## 🧮 Core Financial Rules (MANDATORY)
- Net weight = loaded - empty - (cage_count × cage_weight)
- Losses reduce available inventory
- Partial payments update debts
- Old debt can be paid in new transactions
- Vehicle costs:
  - Paid partners → no deduction
  - Non-vehicle partners → deducted from profit share

---

## 🔐 Roles & Permissions
- USER:
  - Can record daily operations
  - Cannot see profit distribution
- ADMIN:
  - Can close day
  - Can view profits & reports
  - Can manage users & master data

---

## 🚨 Critical Constraints
❌ Do NOT redesign database  
❌ Do NOT rename tables or fields  
❌ Do NOT simplify business logic  
❌ Do NOT remove edge cases  

If something is unclear:
👉 ASK before coding.

---

## 🧩 Coding Style Rules
- Small functions
- Clear naming
- No magic numbers
- Validate inputs strictly
- Throw meaningful errors

---

## 📌 Current Focus
Finish backend infrastructure so frontend can consume stable APIs.

Priority order:
1. migrate.js
2. seed.js
3. server.js
4. buyerController.js
