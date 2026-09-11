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

// Get dedicated pool client
export async function getClient() {
  return await pool.connect();
}

// Helper for executing queries within an isolated ACID transaction
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
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

/**
 * Initialize PostgreSQL Database Tables and Constraints
 */
export async function initDb() {
  try {
    console.log('[PostgreSQL] Initializing database schema & tables...');

    // Drop legacy time_slots table if present
    await query(`DROP TABLE IF EXISTS time_slots CASCADE;`);

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

    // 3. Bookings Table (Customer room reservations with Date, Start Time & End Time)
    // Migrate existing bookings table to ensure start_time/end_time exist and drop old slot_id/slot_label
    await query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bookings') THEN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'start_time') THEN
            ALTER TABLE bookings ADD COLUMN start_time VARCHAR(50);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'end_time') THEN
            ALTER TABLE bookings ADD COLUMN end_time VARCHAR(50);
          END IF;
          -- Auto-fill start_time and end_time from existing slot_id if present
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'slot_id') THEN
            UPDATE bookings 
            SET start_time = SPLIT_PART(slot_id, '-', 1), 
                end_time = SPLIT_PART(slot_id, '-', 2) 
            WHERE (start_time IS NULL OR end_time IS NULL) AND slot_id LIKE '%-%';
            ALTER TABLE bookings DROP COLUMN slot_id;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'slot_label') THEN
            ALTER TABLE bookings DROP COLUMN slot_label;
          END IF;
        END IF;
      END $$;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id VARCHAR(100) PRIMARY KEY,
        customer_id VARCHAR(100) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        room_id VARCHAR(100) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        date VARCHAR(20) NOT NULL,
        start_time VARCHAR(50) NOT NULL,
        end_time VARCHAR(50) NOT NULL,
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
      DROP INDEX IF EXISTS idx_bookings_slot;
      CREATE INDEX IF NOT EXISTS idx_bookings_lookup ON bookings(room_id, date, start_time, end_time, status);
      CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
      CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
      CREATE INDEX IF NOT EXISTS idx_customers_zoho ON customers(zoho_id);
    `);

    // 4. Queues Table (Job queues for Zoho sync, Calendar sync, webhooks, and background processing)
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

    console.log('[PostgreSQL] Database schema verified and ready (time_slots table removed, static slots active).');
    return true;
  } catch (err) {
    console.error('[PostgreSQL] Initialization failed:', err.message);
    throw err;
  }
}
