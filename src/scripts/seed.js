import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, query, pool } from '../config/db.js';
import { zohoCrmService } from '../services/zohoCrmService.js';
import { bookingService } from '../services/bookingService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------------------------------------------
// 5 Meeting Rooms Definition (name, capacity, location/floor)
// -------------------------------------------------------------
export const seedRooms = [
  {
    id: 'room-1',
    name: 'Apollo Executive Boardroom',
    floor: 'Floor 4 (North Wing)',
    capacity: 16,
    hourlyRate: 75.00,
    type: 'Boardroom',
    description: 'Executive conference room with 4K video conferencing, dual presentation screens, ergonomic seating, and city skyline views.',
    image: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=600&auto=format&fit=crop&q=80',
    amenities: ['4K Video Conferencing', 'Dual 75" Displays', 'Smart Whiteboard', 'Wireless Presentation', 'High-Speed Wi-Fi', 'Coffee Machine']
  },
  {
    id: 'room-2',
    name: 'Zenith Strategy Hub',
    floor: 'Floor 3 (East Wing)',
    capacity: 10,
    hourlyRate: 50.00,
    type: 'Meeting Room',
    description: 'Modern collaborative space ideal for team sprint planning, client pitch meetings, and interactive workshops.',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&auto=format&fit=crop&q=80',
    amenities: ['65" Ultra-HD Display', 'Interactive Whiteboard', 'Polycom Speakerphone', 'Glass Whiteboard Wall', 'High-Speed Wi-Fi']
  },
  {
    id: 'room-3',
    name: 'Nexus Creative Studio',
    floor: 'Floor 2 (Innovation Center)',
    capacity: 6,
    hourlyRate: 35.00,
    type: 'Creative Space',
    description: 'Bright, vibrant room designed for brainstorming, design sprints, and dynamic team discussions.',
    image: 'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=600&auto=format&fit=crop&q=80',
    amenities: ['55" Presentation Screen', 'Magnetic Idea Wall', 'Acoustic Soundproofing', 'Wireless AirPlay/Cast', 'High-Speed Wi-Fi']
  },
  {
    id: 'room-4',
    name: 'Orion Focus Pod',
    floor: 'Floor 2 (Quiet Zone)',
    capacity: 4,
    hourlyRate: 25.00,
    type: 'Focus Room',
    description: 'Intimate, soundproof focus pod designed for 1-on-1 reviews, interview sessions, and private client calls.',
    image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=600&auto=format&fit=crop&q=80',
    amenities: ['43" Video Monitor', 'High-Def Webcam & Mic', 'Soundproof Glass', 'High-Speed Wi-Fi']
  },
  {
    id: 'room-5',
    name: 'Cyber Summit Arena',
    floor: 'Floor 5 (Penthouse)',
    capacity: 30,
    hourlyRate: 120.00,
    type: 'Auditorium / Large Hall',
    description: 'High-capacity hall equipped for company all-hands, product launches, panel discussions, and hybrid webinars.',
    image: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=600&auto=format&fit=crop&q=80',
    amenities: ['Dual Laser Projectors', 'Surround Sound Audio', 'Live Stream System', 'Stage & Podium', 'Multi-Mic Setup', 'Refreshment Bar']
  }
];

// -------------------------------------------------------------
// 5 Test Contacts for Zoho CRM (and local Customers table)
// -------------------------------------------------------------
export const seedContacts = [
  {
    firstName: 'Alexander',
    lastName: 'Wright',
    name: 'Alexander Wright',
    email: 'alexander.wright@apextech.io',
    company: 'Apex Technologies',
    department: 'Executive Leadership',
    phone: '+1-555-0142',
    description: 'Chief Technology Officer - Apex Technologies'
  },
  {
    firstName: 'Elena',
    lastName: 'Rostova',
    name: 'Elena Rostova',
    email: 'elena.rostova@quantumdynamics.org',
    company: 'Quantum Dynamics',
    department: 'Product Engineering',
    phone: '+1-555-0189',
    description: 'Head of Engineering - Quantum Dynamics'
  },
  {
    firstName: 'Marcus',
    lastName: 'Vance',
    name: 'Marcus Vance',
    email: 'marcus.vance@stellarventures.com',
    company: 'Stellar Ventures',
    department: 'Strategy & Investments',
    phone: '+1-555-0193',
    description: 'Managing Director - Stellar Ventures'
  },
  {
    firstName: 'Sophia',
    lastName: 'Chen',
    name: 'Sophia Chen',
    email: 'sophia.chen@nexusai.global',
    company: 'Nexus AI Global',
    department: 'AI Research',
    phone: '+1-555-0177',
    description: 'VP of Product & AI Research - Nexus AI Global'
  },
  {
    firstName: 'David',
    lastName: 'Kim',
    name: 'David Kim',
    email: 'david.kim@hypergrowth.co',
    company: 'HyperGrowth Media',
    department: 'Growth Marketing',
    phone: '+1-555-0164',
    description: 'Director of Business Development - HyperGrowth Media'
  }
];

// -------------------------------------------------------------
// Main Seed Execution Function
// -------------------------------------------------------------
async function runSeed() {
  console.log('\n=============================================================');
  console.log('🌱 TURBOSOFT - MEETING ROOM & ZOHO CRM SEED RUNNER');
  console.log('=============================================================\n');

  try {
    // 1. Initialize DB Schema (Tables & Constraints)
    console.log('📦 [1/3] Checking & initializing PostgreSQL database schema...');
    await initDb();

    // 2. Upsert 5 Meeting Rooms into Database
    console.log('\n🏢 [2/3] Seeding 5 Meeting Rooms into PostgreSQL:');
    for (const room of seedRooms) {
      await query(
        `INSERT INTO rooms (id, name, floor, capacity, hourly_rate, type, description, image, amenities, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           floor = EXCLUDED.floor,
           capacity = EXCLUDED.capacity,
           hourly_rate = EXCLUDED.hourly_rate,
           type = EXCLUDED.type,
           description = EXCLUDED.description,
           image = EXCLUDED.image,
           amenities = EXCLUDED.amenities,
           updated_at = CURRENT_TIMESTAMP;`,
        [
          room.id,
          room.name,
          room.floor,
          room.capacity,
          room.hourlyRate,
          room.type,
          room.description,
          room.image,
          JSON.stringify(room.amenities)
        ]
      );
      console.log(`   ✅ [${room.id}] "${room.name}" | Capacity: ${room.capacity} | Location: ${room.floor} | Rate: $${room.hourlyRate}/hr`);
    }

    // 3. Seed 5 Contacts into Zoho CRM & PostgreSQL Customers
    console.log('\n👥 [3/3] Generating 5 Test Contacts in Zoho CRM & Customers Table:');

    const isConnected = zohoCrmService.isConnected();
    let zohoCreatedCount = 0;
    let zohoResults = [];

    if (isConnected) {
      console.log('   🔄 Zoho CRM is connected. Pushing contacts to Zoho CRM API (/crm/v2/Contacts/upsert)...');
      try {
        zohoResults = await zohoCrmService.createContacts(seedContacts);
        console.log(`   ✨ Successfully communicated with Zoho CRM. Upsert response count: ${zohoResults.length}`);

        for (let i = 0; i < seedContacts.length; i++) {
          const contact = seedContacts[i];
          const crmResp = zohoResults[i] || {};
          const zohoId = crmResp.details?.id || null;
          const status = crmResp.status || 'success';
          const code = crmResp.code || 'SUCCESS';

          console.log(`   ✨ CRM Contact: ${contact.name} (${contact.email}) | Zoho ID: ${zohoId || 'Auto-Assigned'} [${code}]`);

          // Save / Sync to PostgreSQL customer directory
          await bookingService.addCustomer({
            id: zohoId ? `zoho-${zohoId}` : undefined,
            zohoId: zohoId ? String(zohoId) : null,
            name: contact.name,
            email: contact.email,
            company: contact.company
          });
          zohoCreatedCount++;
        }

        // Perform full sync check
        try {
          await zohoCrmService.syncCrmContactsToBookingService(bookingService);
        } catch (syncErr) {
          console.log(`   ℹ️ Note on CRM sync cache update: ${syncErr.message}`);
        }
      } catch (crmErr) {
        console.warn(`   ⚠️ Zoho CRM API call note: ${crmErr.message}`);
        console.log('   🔄 Fallback: Inserting contacts into local PostgreSQL customers table...');
        for (const contact of seedContacts) {
          const saved = await bookingService.addCustomer({
            name: contact.name,
            email: contact.email,
            company: contact.company
          });
          console.log(`   ✅ PostgreSQL Contact: ${contact.name} <${contact.email}> | ID: ${saved?.id || 'Saved'}`);
        }
      }
    } else {
      console.log('   ⚠️ Zoho CRM is not connected yet (No active refresh token found in storage).');
      console.log('   🔄 Seeding 5 test customers directly into PostgreSQL database...');

      for (const contact of seedContacts) {
        const saved = await bookingService.addCustomer({
          name: contact.name,
          email: contact.email,
          company: contact.company
        });
        console.log(`   ✅ Local Contact: ${contact.name} <${contact.email}> | Company: ${contact.company} | ID: ${saved?.id || 'Saved'}`);
      }

      console.log('\n   💡 TIP: To push contacts to live Zoho CRM:');
      console.log('      1. Run "npm run dev" and open http://localhost:5000/customers');
      console.log('      2. Connect your Zoho CRM account or enter a developer grant/refresh token.');
      console.log('      3. Re-run "npm run seed" to automatically synchronize with your Zoho CRM account.');
    }

    // Summary Verification
    const roomCountRes = await query(`SELECT COUNT(*)::int AS count FROM rooms;`);
    const custCountRes = await query(`SELECT COUNT(*)::int AS count FROM customers;`);

    console.log('\n=============================================================');
    console.log('🎉 SEED COMPLETED SUCCESSFULLY');
    console.log(`   • Total Meeting Rooms in Database: ${roomCountRes.rows[0].count}`);
    console.log(`   • Total Customers in Database:     ${custCountRes.rows[0].count}`);
    console.log('   • Available Command:               npm run seed');
    console.log('=============================================================\n');

  } catch (err) {
    console.error('\n❌ Error executing seed script:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.exit(process.exitCode || 0);
  }
}

// Execute if run directly via CLI (cmd)
runSeed();
