import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Database Connection Pool
export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'meeting-room-bookings',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client:', err);
});

// Helper for running queries with logging
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 200) {
      console.log(`[PostgreSQL Query] (${duration}ms):`, { text: text.substring(0, 100), rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error(`[PostgreSQL Query Error]: ${err.message}\nQuery: ${text}\nParams:`, params);
    throw err;
  }
}

// Initial Room Configurations for Seeding
const defaultRooms = [
  {
    id: 'room-1',
    name: 'Apollo Executive Boardroom',
    floor: 'Floor 4 (North Wing)',
    capacity: 16,
    hourlyRate: 75,
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
    hourlyRate: 50,
    type: 'Meeting Room',
    description: 'Modern and collaborative space ideal for team sprint planning, client pitch meetings, and workshops.',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&auto=format&fit=crop&q=80',
    amenities: ['65" Ultra-HD Display', 'Interactive Whiteboard', 'Polycom Speakerphone', 'Glass Whiteboard Wall', 'High-Speed Wi-Fi']
  },
  {
    id: 'room-3',
    name: 'Nexus Creative Studio',
    floor: 'Floor 2 (Innovation Center)',
    capacity: 6,
    hourlyRate: 35,
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
    hourlyRate: 25,
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
    hourlyRate: 120,
    type: 'Auditorium / Large Hall',
    description: 'High-capacity hall equipped for company all-hands, product launches, panel discussions, and hybrid webinars.',
    image: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=600&auto=format&fit=crop&q=80',
    amenities: ['Dual Laser Projectors', 'Surround Sound Audio', 'Live Stream System', 'Stage & Podium', 'Multi-Mic Setup', 'Refreshment Bar']
  }
];

// Initial Time Slots for Seeding
const defaultTimeSlots = [
  { id: '09:00-10:00', label: '09:00 AM - 10:00 AM', time: '09:00 AM', period: 'Morning', sortOrder: 1 },
  { id: '10:00-11:00', label: '10:00 AM - 11:00 AM', time: '10:00 AM', period: 'Morning', sortOrder: 2 },
  { id: '11:00-12:00', label: '11:00 AM - 12:00 PM', time: '11:00 AM', period: 'Morning', sortOrder: 3 },
  { id: '12:00-13:00', label: '12:00 PM - 01:00 PM', time: '12:00 PM', period: 'Afternoon', sortOrder: 4 },
  { id: '13:00-14:00', label: '01:00 PM - 02:00 PM', time: '01:00 PM', period: 'Afternoon', sortOrder: 5 },
  { id: '14:00-15:00', label: '02:00 PM - 03:00 PM', time: '02:00 PM', period: 'Afternoon', sortOrder: 6 },
  { id: '15:00-16:00', label: '03:00 PM - 04:00 PM', time: '03:00 PM', period: 'Afternoon', sortOrder: 7 },
  { id: '16:00-17:00', label: '04:00 PM - 05:00 PM', time: '04:00 PM', period: 'Evening', sortOrder: 8 },
  { id: '17:00-18:00', label: '05:00 PM - 06:00 PM', time: '05:00 PM', period: 'Evening', sortOrder: 9 }
];

/**
 * Initialize PostgreSQL Database Tables and Constraints
 */
export async function initDb() {
  try {
    console.log('[PostgreSQL] Initializing database schema & tables...');

    // 1. Customers Table (Synchronized from Zoho CRM or added manually)
    // Migrate existing table if old columns exist
    await query(`
      DO $$ 
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
          -- Rename created to created_at if present
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'created') THEN
            ALTER TABLE customers RENAME COLUMN created TO created_at;
          END IF;
          -- Rename updated to updated_at if present
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'updated') THEN
            ALTER TABLE customers RENAME COLUMN updated TO updated_at;
          END IF;
          -- Drop unused columns
          ALTER TABLE customers DROP COLUMN IF EXISTS phone;
          ALTER TABLE customers DROP COLUMN IF EXISTS department;
          ALTER TABLE customers DROP COLUMN IF EXISTS avatar;
          ALTER TABLE customers DROP COLUMN IF EXISTS initials;
          ALTER TABLE customers DROP COLUMN IF EXISTS badge_color;
          ALTER TABLE customers DROP COLUMN IF EXISTS source;
        END IF;
      END $$;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR(100) PRIMARY KEY,
        zoho_id VARCHAR(100) UNIQUE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        company VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Rooms Table (Physical meeting room inventory)
    await query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        floor VARCHAR(100),
        capacity INT NOT NULL DEFAULT 4,
        hourly_rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        type VARCHAR(100) DEFAULT 'Meeting Room',
        description TEXT,
        image TEXT,
        amenities JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Time Slots Table (Meeting schedule intervals)
    await query(`
      CREATE TABLE IF NOT EXISTS time_slots (
        id VARCHAR(50) PRIMARY KEY,
        label VARCHAR(100) NOT NULL,
        time VARCHAR(50) NOT NULL,
        period VARCHAR(50) NOT NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Bookings Table (Customer room reservations)
    await query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id VARCHAR(100) PRIMARY KEY,
        customer_id VARCHAR(100) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        room_id VARCHAR(100) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        date VARCHAR(20) NOT NULL,
        slot_id VARCHAR(50) NOT NULL,
        slot_label VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        attendees INT DEFAULT 2,
        notes TEXT,
        total_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        status VARCHAR(50) DEFAULT 'Confirmed',
        google_event_id VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Indexes for fast lookup
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_lookup ON bookings(room_id, date, slot_id, status);
      CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
      CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
      CREATE INDEX IF NOT EXISTS idx_customers_zoho ON customers(zoho_id);
    `);

    // 5. Queues Table (Job queues for Zoho sync, Calendar sync, webhooks, and background processing)
    await query(`
      CREATE TABLE IF NOT EXISTS queues (
        id VARCHAR(100) PRIMARY KEY,
        type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(50) DEFAULT 'PENDING',
        attempts INT DEFAULT 0,
        max_attempts INT DEFAULT 3,
        error_message TEXT,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_queues_status_type ON queues(status, type);
    `);

    // Seed Rooms if empty
    const roomCheck = await query(`SELECT COUNT(*) as count FROM rooms;`);
    if (parseInt(roomCheck.rows[0].count, 10) === 0) {
      console.log('[PostgreSQL] Seeding initial room configurations into database...');
      for (const r of defaultRooms) {
        await query(
          `INSERT INTO rooms (id, name, floor, capacity, hourly_rate, type, description, image, amenities)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING;`,
          [r.id, r.name, r.floor, r.capacity, r.hourlyRate, r.type, r.description, r.image, JSON.stringify(r.amenities)]
        );
      }
    }

    // Seed Time Slots if empty
    const slotCheck = await query(`SELECT COUNT(*) as count FROM time_slots;`);
    if (parseInt(slotCheck.rows[0].count, 10) === 0) {
      console.log('[PostgreSQL] Seeding time slots into database...');
      for (const s of defaultTimeSlots) {
        await query(
          `INSERT INTO time_slots (id, label, time, period, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING;`,
          [s.id, s.label, s.time, s.period, s.sortOrder]
        );
      }
    }

    console.log('[PostgreSQL] Database schema verified and ready.');
    return true;
  } catch (err) {
    console.error('[PostgreSQL] Initialization failed:', err.message);
    throw err;
  }
}
