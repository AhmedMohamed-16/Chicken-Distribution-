require('dotenv').config();
const { 
  sequelize,
  User, 
  Partner, 
  Vehicle,
  VehiclePartner,
  Farm,
  Buyer,
  ChickenType, 
  CostCategory
} = require('../models');

async function seed() {
  try {
    console.log('🌱 Starting database seeding...');

    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection successful');

    // ============================================
    // 1. CREATE DEFAULT USERS
    // ============================================
    console.log('\n👤 Creating users...');
    
    const adminExists = await User.findOne({ where: { username: 'admin' } });
    if (!adminExists) {
      await User.create({
        username: 'admin',
        password_hash: 'admin123', // Will be hashed by the model hook
        full_name: 'مدير النظام',
        role: 'ADMIN',
        is_active: true
      });
      console.log('   ✅ Admin user created (username: admin, password: admin123)');
    } else {
      console.log('   ⏭️  Admin user already exists');
    }

    const userExists = await User.findOne({ where: { username: 'user' } });
    if (!userExists) {
      await User.create({
        username: 'user',
        password_hash: 'user123',
        full_name: 'مستخدم عادي',
        role: 'USER',
        is_active: true
      });
      console.log('   ✅ Regular user created (username: user, password: user123)');
    } else {
      console.log('   ⏭️  Regular user already exists');
    }

    // ============================================
    // 2. CREATE CHICKEN TYPES
    // ============================================
    console.log('\n🐔 Creating chicken types...');
    
    const chickenTypes = [
      { name: 'دجاج أبيض', description: 'White broiler chicken' },
      { name: 'دجاج أحمر', description: 'Red broiler chicken' },
      { name: 'دجاج بلدي', description: 'Local/farm chicken' },
      { name: 'دجاج ساسو', description: 'Sasso chicken' }
    ];

    for (const type of chickenTypes) {
      const exists = await ChickenType.findOne({ where: { name: type.name } });
      if (!exists) {
        await ChickenType.create(type);
        console.log(`   ✅ Created: ${type.name}`);
      } else {
        console.log(`   ⏭️  Already exists: ${type.name}`);
      }
    }

    // ============================================
    // 3. CREATE COST CATEGORIES
    // ============================================
    console.log('\n💰 Creating cost categories...');
    
    const costCategories = [
      { name: 'وقود', description: 'Fuel costs', is_vehicle_cost: true },
      { name: 'صيانة العربية', description: 'Vehicle maintenance', is_vehicle_cost: true },
      { name: 'رسوم طريق', description: 'Highway tolls', is_vehicle_cost: true },
      { name: 'غسيل العربية', description: 'Vehicle washing', is_vehicle_cost: true },
      { name: 'عمالة', description: 'Labor costs', is_vehicle_cost: false },
      { name: 'ثلج', description: 'Ice for cooling', is_vehicle_cost: false },
      { name: 'أقفاص', description: 'Cage rental/purchase', is_vehicle_cost: false },
      { name: 'مصاريف إدارية', description: 'Administrative expenses', is_vehicle_cost: false },
      { name: 'كراتين', description: 'Boxes/packaging', is_vehicle_cost: false }
    ];

    for (const category of costCategories) {
      const exists = await CostCategory.findOne({ where: { name: category.name } });
      if (!exists) {
        await CostCategory.create(category);
        console.log(`   ✅ Created: ${category.name} (Vehicle: ${category.is_vehicle_cost})`);
      } else {
        console.log(`   ⏭️  Already exists: ${category.name}`);
      }
    }

    // ============================================
    // 4. CREATE SAMPLE PARTNERS
    // ============================================
    console.log('\n👥 Creating sample partners...');
    
    const partners = [
      {
        name: 'محمد أحمد',
        phone: '01234567890',
        address: 'القاهرة، مصر',
        investment_amount: 100000,
        investment_percentage: 40,
        is_vehicle_partner: true
      },
      {
        name: 'أحمد محمود',
        phone: '01234567891',
        address: 'الجيزة، مصر',
        investment_amount: 87500,
        investment_percentage: 35,
        is_vehicle_partner: true
      },
      {
        name: 'خالد حسن',
        phone: '01234567892',
        address: 'الإسكندرية، مصر',
        investment_amount: 62500,
        investment_percentage: 25,
        is_vehicle_partner: false
      }
    ];

    for (const partner of partners) {
      const exists = await Partner.findOne({ where: { name: partner.name } });
      if (!exists) {
        await Partner.create(partner);
        console.log(`   ✅ Created: ${partner.name} (${partner.investment_percentage}% - Vehicle Partner: ${partner.is_vehicle_partner})`);
      } else {
        console.log(`   ⏭️  Already exists: ${partner.name}`);
      }
    }

    // ============================================
    // 5. CREATE SAMPLE VEHICLE
    // ============================================
    console.log('\n🚛 Creating sample vehicle...');
    
    const vehicleExists = await Vehicle.findOne({ where: { plate_number: 'ABC 123' } });
    if (!vehicleExists) {
      const vehicle = await Vehicle.create({
        name: 'Toyota Truck',
        purchase_price: 150000,
        empty_weight: 3500,
        plate_number: 'ABC 123'
      });

      // Assign vehicle to vehicle partners
      const vehiclePartners = await Partner.findAll({ where: { is_vehicle_partner: true } });
      const sharePercentage = 100 / vehiclePartners.length;

      for (const partner of vehiclePartners) {
        await VehiclePartner.create({
          vehicle_id: vehicle.id,
          partner_id: partner.id,
          share_percentage: sharePercentage
        });
      }

      console.log(`   ✅ Created vehicle: ${vehicle.name} (${vehicle.plate_number})`);
      console.log(`   ✅ Assigned to ${vehiclePartners.length} vehicle partners`);
    } else {
      console.log('   ⏭️  Vehicle already exists');
    }

    // ============================================
    // 6. CREATE SAMPLE FARMS
    // ============================================
    console.log('\n🏡 Creating sample farms...');
    
    const farms = [
      {
        name: 'مزرعة النور',
        owner_name: 'عبد الله محمد',
        location: 'الفيوم، مصر',
        phone: '01111111111',
        total_debt: 0
      },
      {
        name: 'مزرعة الأمل',
        owner_name: 'حسن علي',
        location: 'بني سويف، مصر',
        phone: '01222222222',
        total_debt: 0
      },
      {
        name: 'مزرعة الخير',
        owner_name: 'سعيد أحمد',
        location: 'المنيا، مصر',
        phone: '01333333333',
        total_debt: 0
      }
    ];

    for (const farm of farms) {
      const exists = await Farm.findOne({ where: { name: farm.name } });
      if (!exists) {
        await Farm.create(farm);
        console.log(`   ✅ Created: ${farm.name} - ${farm.owner_name}`);
      } else {
        console.log(`   ⏭️  Already exists: ${farm.name}`);
      }
    }

    // ============================================
    // 7. CREATE SAMPLE BUYERS
    // ============================================
    console.log('\n🛒 Creating sample buyers...');
    
    const buyers = [
      {
        name: 'محل الطيور',
        phone: '01444444444',
        address: 'شارع الجمهورية، القاهرة',
        total_debt: 0
      },
      {
        name: 'سوبر ماركت النور',
        phone: '01555555555',
        address: 'شارع الهرم، الجيزة',
        total_debt: 0
      },
      {
        name: 'مطعم الفراخ الذهبية',
        phone: '01666666666',
        address: 'ميدان التحرير، القاهرة',
        total_debt: 0
      }
    ];

    for (const buyer of buyers) {
      const exists = await Buyer.findOne({ where: { name: buyer.name } });
      if (!exists) {
        await Buyer.create(buyer);
        console.log(`   ✅ Created: ${buyer.name}`);
      } else {
        console.log(`   ⏭️  Already exists: ${buyer.name}`);
      }
    }

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(50));
    console.log('🎉 Database seeding completed successfully!');
    console.log('='.repeat(50));
    console.log('\n📊 Summary:');
    console.log(`   - Users: ${await User.count()}`);
    console.log(`   - Partners: ${await Partner.count()}`);
    console.log(`   - Vehicles: ${await Vehicle.count()}`);
    console.log(`   - Farms: ${await Farm.count()}`);
    console.log(`   - Buyers: ${await Buyer.count()}`);
    console.log(`   - Chicken Types: ${await ChickenType.count()}`);
    console.log(`   - Cost Categories: ${await CostCategory.count()}`);
    
    console.log('\n🚀 You can now start the server with: npm run dev');
    console.log('\n🔐 Default credentials:');
    console.log('   Admin: username=admin, password=admin123');
    console.log('   User:  username=user,  password=user123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    console.error('\nError details:', error.message);
    process.exit(1);
  }
}

// Run seeding
seed();