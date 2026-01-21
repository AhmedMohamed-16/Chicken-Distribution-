# 🐔 Chicken Distribution & Sales Management System - Backend API

A comprehensive RESTful API for managing chicken distribution operations, including farm loading, sales transactions, transport losses, cost tracking, and partner profit distribution.

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Environment Variables](#environment-variables)
- [Business Logic](#business-logic)

## ✨ Features

### Core Functionality
- ✅ User authentication & authorization (Admin/User roles)
- ✅ Master data management (Partners, Farms, Buyers, Vehicles)
- ✅ Daily operations workflow
- ✅ Multi-source farm loading with weighing
- ✅ Sales transactions with debt management
- ✅ Transport loss tracking
- ✅ Cost allocation (Vehicle vs. Other costs)
- ✅ Automated profit calculation & distribution
- ✅ Comprehensive reporting system
- ✅ Debt tracking for farms and buyers

### Advanced Features
- 📊 Partner-specific profit distribution
- 💰 Vehicle cost segregation for vehicle partners
- 📈 Period-based profit reports
- 🔍 Detailed debt history tracking
- 🔐 JWT-based secure authentication
- ⚡ PostgreSQL database with Sequelize ORM

## 🛠 Tech Stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Sequelize
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcryptjs
- **Validation**: express-validator
- **Logging**: Morgan

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js          # PostgreSQL configuration
│   │   ├── migrate.js           # Database migration script
│   │   └── seed.js              # Database seeding script
│   ├── models/
│   │   ├── index.js             # Model registry & associations
│   │   ├── User.js
│   │   ├── Partner.js
│   │   ├── Vehicle.js
│   │   ├── Farm.js
│   │   ├── Buyer.js
│   │   ├── ChickenType.js
│   │   ├── CostCategory.js
│   │   ├── DailyOperation.js
│   │   ├── FarmTransaction.js
│   │   ├── SaleTransaction.js
│   │   ├── TransportLoss.js
│   │   ├── DailyCost.js
│   │   ├── ProfitDistribution.js
│   │   └── PartnerProfit.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── partnerController.js
│   │   ├── farmController.js
│   │   ├── buyerController.js
│   │   ├── vehicleController.js
│   │   ├── operationController.js
│   │   └── reportController.js
│   ├── services/
│   │   └── ProfitService.js     # Profit calculation logic
│   ├── middleware/
│   │   └── auth.js              # Authentication & authorization
│   ├── routes/
│   │   └── index.js             # API route definitions
│   └── app.js                   # Express app configuration
├── server.js                    # Server entry point
├── package.json
└── .env.example
```

## 🚀 Installation

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- npm or yarn

### Steps

1. **Clone the repository**
```bash
git clone <repository-url>
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` file with your PostgreSQL credentials:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chicken_distribution
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_super_secret_key
```

## 🗄 Database Setup

### Create Database
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE chicken_distribution;
```

### Run Migrations
```bash
npm run migrate
```

This will create all necessary tables with proper relationships.

### Seed Initial Data
```bash
npm run seed
```

This will create:
- Default admin user (username: `admin`, password: `admin123`)
- Default regular user (username: `user`, password: `user123`)
- Chicken types (White, Red, Local)
- Cost categories (Fuel, Maintenance, Labor, etc.)
- Sample partners

## ▶️ Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The API will be available at `http://localhost:5000`

## 📚 API Documentation

### Authentication

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}

Response:
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "username": "admin",
    "full_name": "مدير النظام",
    "role": "ADMIN"
  }
}
```

#### Get Profile
```http
GET /api/auth/profile
Authorization: Bearer {token}
```

### Master Data

#### Partners (Admin Only)
```http
GET    /api/partners
GET    /api/partners/:id
POST   /api/partners
PUT    /api/partners/:id
DELETE /api/partners/:id
```

#### Farms
```http
GET    /api/farms
GET    /api/farms/:id
POST   /api/farms                    # Admin only
PUT    /api/farms/:id                # Admin only
DELETE /api/farms/:id                # Admin only
GET    /api/farms/:id/debt-history
```

#### Buyers
```http
GET    /api/buyers
GET    /api/buyers/:id
POST   /api/buyers                   # Admin only
PUT    /api/buyers/:id               # Admin only
DELETE /api/buyers/:id               # Admin only
GET    /api/buyers/:id/debt-history
```

#### Vehicles
```http
GET    /api/vehicles
GET    /api/vehicles/:id
POST   /api/vehicles                 # Admin only
PUT    /api/vehicles/:id             # Admin only
DELETE /api/vehicles/:id             # Admin only
```

### Daily Operations

#### Start Daily Operation
```http
POST /api/daily-operations/start
Authorization: Bearer {token}

{
  "operation_date": "2026-01-19",
  "vehicle_id": 1
}
```

#### Record Farm Loading
```http
POST /api/daily-operations/:id/farm-loading
Authorization: Bearer {token}

{
  "farm_id": 1,
  "chicken_type_id": 1,
  "empty_vehicle_weight": 3500,
  "loaded_vehicle_weight": 5500,
  "cage_count": 20,
  "cage_weight_per_unit": 15,
  "price_per_kg": 45,
  "paid_amount": 50000
}

Response: Calculates net_chicken_weight, total_amount, remaining_amount
```

#### Record Transport Loss
```http
POST /api/daily-operations/:id/transport-loss
Authorization: Bearer {token}

{
  "chicken_type_id": 1,
  "dead_weight": 50,
  "price_per_kg": 45,
  "location": "On highway"
}
```

#### Record Daily Cost
```http
POST /api/daily-operations/:id/cost
Authorization: Bearer {token}

{
  "cost_category_id": 1,
  "amount": 500,
  "description": "Fuel for the day"
}
```

#### Record Sale
```http
POST /api/daily-operations/:id/sale
Authorization: Bearer {token}

{
  "buyer_id": 1,
  "chicken_type_id": 1,
  "loaded_cages_weight": 2000,
  "empty_cages_weight": 300,
  "cage_count": 20,
  "price_per_kg": 50,
  "paid_amount": 80000,
  "old_debt_paid": 5000
}
```

#### Close Daily Operation (Admin Only)
```http
POST /api/daily-operations/:id/close
Authorization: Bearer {token}

Response: Complete profit distribution with partner shares
```

### Reports

#### Daily Report
```http
GET /api/reports/daily/:date
Authorization: Bearer {token}

Example: /api/reports/daily/2026-01-19
```

#### Period Report (Admin Only)
```http
GET /api/reports/period?from=2026-01-01&to=2026-01-31
Authorization: Bearer {token}
```

#### Partner Profit Report (Admin Only)
```http
GET /api/reports/partner-profits?from=2026-01-01&to=2026-01-31
Authorization: Bearer {token}
```

#### Farm Debt Report
```http
GET /api/reports/farm-debts
Authorization: Bearer {token}
```

#### Buyer Debt Report
```http
GET /api/reports/buyer-debts
Authorization: Bearer {token}
```

## 🔐 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | development |
| `PORT` | Server port | 5000 |
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `DB_NAME` | Database name | chicken_distribution |
| `DB_USER` | Database user | postgres |
| `DB_PASSWORD` | Database password | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_EXPIRE` | JWT expiration time | 7d |
| `CORS_ORIGIN` | Allowed CORS origin | http://localhost:4200 |

## 💡 Business Logic

### Profit Calculation Formula

```
Net Profit = Total Revenue - Total Purchases - Total Losses - Total Costs

Where:
- Total Revenue = Sum of all sales
- Total Purchases = Sum of all farm purchases
- Total Losses = Sum of (Dead Weight × Price)
- Total Costs = Vehicle Costs + Other Costs
```

### Partner Distribution

```
For each partner:
  Base Share = Net Profit × (Investment Percentage / 100)
  
  IF partner is vehicle partner:
    Vehicle Cost Share = 0 (already paid from total costs)
  ELSE:
    Vehicle Cost Share = Vehicle Costs × (Investment Percentage / 100)
  
  Final Profit = Base Share - Vehicle Cost Share
```

### Example
**Given:**
- Net Profit: 44,250 EGP
- Vehicle Costs: 1,500 EGP
- Partners:
  - A: 40% (vehicle partner)
  - B: 35% (vehicle partner)
  - C: 25% (NOT vehicle partner)

**Calculation:**
- Partner A: 44,250 × 0.40 = 17,700 EGP
- Partner B: 44,250 × 0.35 = 15,487.50 EGP
- Partner C: (44,250 × 0.25) - (1,500 × 0.25) = 11,062.50 - 375 = 10,687.50 EGP

## 🧪 Testing

```bash
# Test database connection
npm run migrate

# Test with sample data
npm run seed

# Start server and test endpoints
npm run dev
```

## 📝 License

This project is proprietary software.

## 👥 Support

For support, please contact the development team.

---

**Built with ❤️ using Node.js, Express, and PostgreSQL**
