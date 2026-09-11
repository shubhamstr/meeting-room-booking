import { query } from '../config/db.js';

// Helper to get formatted date string YYYY-MM-DD
export function getTodayDateString(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

class BookingService {
  // --- Customer Operations (PostgreSQL) ---

  async getCustomers(searchQuery = '') {
    let sql = `
      SELECT 
        c.id,
        c.zoho_id AS "zohoId",
        c.name,
        c.email,
        c.company,
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        COUNT(b.id) FILTER (WHERE b.status != 'Cancelled')::int AS "bookingCount"
      FROM customers c
      LEFT JOIN bookings b ON c.id = b.customer_id
    `;
    const params = [];

    if (searchQuery && searchQuery.trim()) {
      const q = `%${searchQuery.trim().toLowerCase()}%`;
      sql += ` WHERE LOWER(c.name) LIKE $1 OR LOWER(c.email) LIKE $1`;
      params.push(q);
    }

    sql += ` GROUP BY c.id ORDER BY c.created_at DESC;`;

    const res = await query(sql, params);
    return res.rows;
  }

  async getPaginatedCustomers({ search = '', page = 1, limit = 10 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (pageNum - 1) * pageSize;

    let countSql = `SELECT COUNT(*)::int AS total FROM customers c`;
    const countParams = [];

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      countSql += ` WHERE LOWER(c.name) LIKE $1 OR LOWER(c.email) LIKE $1`;
      countParams.push(q);
    }

    const countRes = await query(countSql, countParams);
    const total = countRes.rows[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    let dataSql = `
      SELECT 
        c.id,
        c.zoho_id AS "zohoId",
        c.name,
        c.email,
        c.company,
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        COUNT(b.id) FILTER (WHERE b.status != 'Cancelled')::int AS "bookingCount"
      FROM customers c
      LEFT JOIN bookings b ON c.id = b.customer_id
    `;
    const dataParams = [];
    let paramIdx = 1;

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      dataSql += ` WHERE LOWER(c.name) LIKE $${paramIdx} OR LOWER(c.email) LIKE $${paramIdx}`;
      dataParams.push(q);
      paramIdx++;
    }

    dataSql += ` GROUP BY c.id ORDER BY c.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++};`;
    dataParams.push(pageSize, offset);

    const dataRes = await query(dataSql, dataParams);

    return {
      customers: dataRes.rows,
      total,
      page: pageNum,
      pageSize,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    };
  }

  async getCustomerById(id) {
    if (!id) return null;
    const res = await query(
      `SELECT 
        id,
        zoho_id AS "zohoId",
        name,
        email,
        company,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
       FROM customers 
       WHERE id = $1 LIMIT 1;`,
      [id]
    );
    return res.rows[0] || null;
  }

  async getCustomerByEmail(email) {
    if (!email) return null;
    const res = await query(
      `SELECT 
        id,
        zoho_id AS "zohoId",
        name,
        email,
        company,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
       FROM customers 
       WHERE LOWER(email) = LOWER($1) LIMIT 1;`,
      [email.trim()]
    );
    return res.rows[0] || null;
  }

  async getCustomerByZohoId(zohoId) {
    if (!zohoId) return null;
    const res = await query(
      `SELECT 
        id,
        zoho_id AS "zohoId",
        name,
        email,
        company,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
       FROM customers 
       WHERE zoho_id = $1 LIMIT 1;`,
      [String(zohoId)]
    );
    return res.rows[0] || null;
  }

  async addCustomer({ id, zohoId, name, email, company }) {
    const safeName = String(name || '').trim();
    const safeEmail = String(email || '').trim().toLowerCase();
    const safeCompany = company ? (typeof company === 'object' ? (company.name || company.value || 'Independent Corp') : String(company).trim()) : 'Independent Corp';
    const customerId = id || `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // If customer already exists in PostgreSQL by zohoId or email, do not re-insert or overwrite
    if (zohoId) {
      const existingByZoho = await this.getCustomerByZohoId(zohoId);
      if (existingByZoho) {
        return existingByZoho;
      }
    }
    if (safeEmail) {
      const existingByEmail = await this.getCustomerByEmail(safeEmail);
      if (existingByEmail) {
        return existingByEmail;
      }
    }

    const res = await query(
      `INSERT INTO customers (id, zoho_id, name, email, company, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO NOTHING
       RETURNING 
         id,
         zoho_id AS "zohoId",
         name,
         email,
         company,
         created_at AS "createdAt",
         updated_at AS "updatedAt";`,
      [customerId, zohoId || null, safeName, safeEmail, safeCompany]
    );

    if (res.rows && res.rows[0]) {
      return res.rows[0];
    }

    // Fallback if conflict prevented insertion
    return (await this.getCustomerByEmail(safeEmail)) || (zohoId ? await this.getCustomerByZohoId(zohoId) : null);
  }

  async updateCustomer(id, { name, email, company, zohoId }) {
    if (!id) return null;
    const res = await query(
      `UPDATE customers
       SET name = COALESCE($2, name),
           email = COALESCE($3, email),
           company = COALESCE($4, company),
           zoho_id = COALESCE($5, zoho_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING 
         id,
         zoho_id AS "zohoId",
         name,
         email,
         company,
         created_at AS "createdAt",
         updated_at AS "updatedAt";`,
      [
        id,
        name ? String(name).trim() : null,
        email ? String(email).trim().toLowerCase() : null,
        company ? String(company).trim() : null,
        zohoId ? String(zohoId).trim() : null
      ]
    );
    return res.rows[0] || null;
  }

  // --- Room Operations (PostgreSQL) ---

  async getRooms(minCapacity = 0) {
    let sql = `
      SELECT 
        id,
        name,
        floor,
        capacity,
        hourly_rate::float AS "hourlyRate",
        type,
        description,
        image,
        amenities
      FROM rooms
    `;
    const params = [];

    if (minCapacity > 0) {
      sql += ` WHERE capacity >= $1`;
      params.push(minCapacity);
    }

    sql += ` ORDER BY capacity ASC;`;

    const res = await query(sql, params);
    return res.rows.map(r => ({
      ...r,
      amenities: typeof r.amenities === 'string' ? JSON.parse(r.amenities) : (r.amenities || [])
    }));
  }

  async getPaginatedRooms({ search = '', minCapacity = 0, page = 1, limit = 6 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 6);
    const offset = (pageNum - 1) * pageSize;

    let countSql = `SELECT COUNT(*)::int AS total FROM rooms r WHERE 1=1`;
    const countParams = [];
    let countIdx = 1;

    if (minCapacity > 0) {
      countSql += ` AND r.capacity >= $${countIdx++}`;
      countParams.push(minCapacity);
    }

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      countSql += ` AND (LOWER(r.name) LIKE $${countIdx} OR LOWER(r.type) LIKE $${countIdx} OR LOWER(r.floor) LIKE $${countIdx})`;
      countParams.push(q);
      countIdx++;
    }

    const countRes = await query(countSql, countParams);
    const total = countRes.rows[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    let dataSql = `
      SELECT 
        r.id,
        r.name,
        r.floor,
        r.capacity,
        r.hourly_rate::float AS "hourlyRate",
        r.type,
        r.description,
        r.image,
        r.amenities
      FROM rooms r
      WHERE 1=1
    `;
    const dataParams = [];
    let paramIdx = 1;

    if (minCapacity > 0) {
      dataSql += ` AND r.capacity >= $${paramIdx++}`;
      dataParams.push(minCapacity);
    }

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      dataSql += ` AND (LOWER(r.name) LIKE $${paramIdx} OR LOWER(r.type) LIKE $${paramIdx} OR LOWER(r.floor) LIKE $${paramIdx})`;
      dataParams.push(q);
      paramIdx++;
    }

    dataSql += ` ORDER BY r.capacity ASC LIMIT $${paramIdx++} OFFSET $${paramIdx++};`;
    dataParams.push(pageSize, offset);

    const dataRes = await query(dataSql, dataParams);
    const rooms = dataRes.rows.map(r => ({
      ...r,
      amenities: typeof r.amenities === 'string' ? JSON.parse(r.amenities) : (r.amenities || [])
    }));

    return {
      rooms,
      total,
      page: pageNum,
      pageSize,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    };
  }

  async getRoomById(id) {
    if (!id) return null;
    const res = await query(
      `SELECT 
        id,
        name,
        floor,
        capacity,
        hourly_rate::float AS "hourlyRate",
        type,
        description,
        image,
        amenities
       FROM rooms 
       WHERE id = $1 LIMIT 1;`,
      [id]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      ...r,
      amenities: typeof r.amenities === 'string' ? JSON.parse(r.amenities) : (r.amenities || [])
    };
  }

  // --- Time Slots & Availability Operations (PostgreSQL) ---

  async getAllSlots() {
    const res = await query(`
      SELECT 
        id,
        label,
        time,
        period,
        sort_order AS "sortOrder"
      FROM time_slots 
      ORDER BY sort_order ASC;
    `);
    return res.rows;
  }

  async getSlotsWithAvailability(roomId, date) {
    const targetDate = date || getTodayDateString(0);

    // Fetch all slots
    const slots = await this.getAllSlots();

    // Fetch active bookings for this room & date from PostgreSQL
    const bookingsRes = await query(
      `SELECT 
        b.id,
        b.slot_id AS "slotId",
        b.title,
        c.name AS "customerName"
       FROM bookings b
       JOIN customers c ON b.customer_id = c.id
       WHERE b.room_id = $1 AND b.date = $2 AND b.status != 'Cancelled';`,
      [roomId, targetDate]
    );

    const existingBookings = bookingsRes.rows;
    const bookedSlotMap = new Map(existingBookings.map(b => [b.slotId, b]));

    return slots.map(slot => {
      const isBooked = bookedSlotMap.has(slot.id);
      const bookingInfo = isBooked ? bookedSlotMap.get(slot.id) : null;

      return {
        id: slot.id,
        label: slot.label,
        time: slot.time,
        period: slot.period,
        isAvailable: !isBooked,
        bookedBy: bookingInfo ? bookingInfo.customerName : null,
        bookingTitle: bookingInfo ? bookingInfo.title : null
      };
    });
  }

  // --- Booking Operations (PostgreSQL) ---

  async createBooking({ customerId, roomId, date, slotId, title, attendees, notes }) {
    const customer = await this.getCustomerById(customerId);
    if (!customer) {
      throw new Error('Customer not found. Please pick or register a valid customer.');
    }

    const room = await this.getRoomById(roomId);
    if (!room) {
      throw new Error('Meeting room not found.');
    }

    const slots = await this.getAllSlots();
    const slot = slots.find(s => s.id === slotId);
    if (!slot) {
      throw new Error('Invalid time slot selected.');
    }

    // Check slot collision in PostgreSQL
    const collisionCheck = await query(
      `SELECT id FROM bookings 
       WHERE room_id = $1 AND date = $2 AND slot_id = $3 AND status != 'Cancelled'
       LIMIT 1;`,
      [roomId, date, slotId]
    );

    if (collisionCheck.rows.length > 0) {
      throw new Error(`Room "${room.name}" is already booked for ${slot.label} on ${date}.`);
    }

    const bookingId = `BK-${Math.floor(1000 + Math.random() * 9000)}`;
    const bookingTitle = title?.trim() || `Team Sync - ${customer.company}`;
    const attendeeCount = parseInt(attendees, 10) || 2;
    const bookingNotes = notes?.trim() || '';
    const totalCost = room.hourlyRate;

    const res = await query(
      `INSERT INTO bookings (
        id, customer_id, room_id, date, slot_id, slot_label, title, attendees, notes, total_cost, status, google_event_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Confirmed', NULL)
      RETURNING 
        id,
        customer_id AS "customerId",
        room_id AS "roomId",
        date,
        slot_id AS "slotId",
        slot_label AS "slotLabel",
        title,
        attendees,
        notes,
        total_cost::float AS "totalCost",
        status,
        google_event_id AS "googleEventId",
        created_at AS "createdAt";`,
      [bookingId, customer.id, room.id, date, slot.id, slot.label, bookingTitle, attendeeCount, bookingNotes, totalCost]
    );

    const newBooking = res.rows[0];

    return {
      ...newBooking,
      customerName: customer.name,
      customerCompany: customer.company,
      roomName: room.name
    };
  }

  async updateBooking(bookingId, updates = {}) {
    const fields = [];
    const values = [];
    let idx = 1;

    if (updates.googleEventId !== undefined) {
      fields.push(`google_event_id = $${idx++}`);
      values.push(updates.googleEventId);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(updates.title);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(updates.notes);
    }

    if (fields.length === 0) return null;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(bookingId);

    const res = await query(
      `UPDATE bookings SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *;`,
      values
    );

    return res.rows[0] || null;
  }

  async cancelBooking(bookingId) {
    const res = await query(
      `UPDATE bookings 
       SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING 
        id,
        customer_id AS "customerId",
        room_id AS "roomId",
        date,
        slot_id AS "slotId",
        slot_label AS "slotLabel",
        title,
        status,
        google_event_id AS "googleEventId";`,
      [bookingId]
    );

    if (res.rows.length === 0) {
      throw new Error('Booking not found.');
    }

    return res.rows[0];
  }

  async getBookings({ search = '', customerId = '', roomId = '', status = '', date = '' } = {}) {
    let sql = `
      SELECT 
        b.id,
        b.customer_id AS "customerId",
        c.name AS "customerName",
        c.company AS "customerCompany",
        c.email AS "customerEmail",
        b.room_id AS "roomId",
        r.name AS "roomName",
        r.floor AS "roomFloor",
        b.date,
        b.slot_id AS "slotId",
        b.slot_label AS "slotLabel",
        b.title,
        b.attendees,
        b.notes,
        b.total_cost::float AS "totalCost",
        b.status,
        b.google_event_id AS "googleEventId",
        b.created_at AS "createdAt"
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      JOIN rooms r ON b.room_id = r.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (customerId) {
      sql += ` AND b.customer_id = $${idx++}`;
      params.push(customerId);
    }
    if (roomId) {
      sql += ` AND b.room_id = $${idx++}`;
      params.push(roomId);
    }
    if (status) {
      sql += ` AND LOWER(b.status) = LOWER($${idx++})`;
      params.push(status);
    }
    if (date) {
      sql += ` AND b.date = $${idx++}`;
      params.push(date);
    }
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(b.title) LIKE $${idx} OR LOWER(c.name) LIKE $${idx} OR LOWER(r.name) LIKE $${idx} OR LOWER(b.id) LIKE $${idx})`;
      params.push(q);
      idx++;
    }

    sql += ` ORDER BY b.date DESC, b.slot_id ASC;`;

    const res = await query(sql, params);
    return res.rows;
  }

  async getStats() {
    const today = getTodayDateString(0);

    const [custRes, roomRes, activeBookRes, todayBookRes, revRes] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM customers;`),
      query(`SELECT COUNT(*)::int AS count FROM rooms;`),
      query(`SELECT COUNT(*)::int AS count FROM bookings WHERE status = 'Confirmed';`),
      query(`SELECT COUNT(*)::int AS count FROM bookings WHERE date = $1 AND status != 'Cancelled';`, [today]),
      query(`SELECT COALESCE(SUM(total_cost), 0)::float AS total FROM bookings WHERE status = 'Confirmed';`)
    ]);

    return {
      totalCustomers: custRes.rows[0].count,
      totalRooms: roomRes.rows[0].count,
      activeBookings: activeBookRes.rows[0].count,
      todayBookingsCount: todayBookRes.rows[0].count,
      totalRevenue: revRes.rows[0].total
    };
  }

  // --- Queue Operations (PostgreSQL) ---

  async addToQueue(type, payload = {}) {
    const queueId = `Q-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const res = await query(
      `INSERT INTO queues (id, type, payload, status)
       VALUES ($1, $2, $3, 'PENDING')
       RETURNING *;`,
      [queueId, type, JSON.stringify(payload)]
    );
    return res.rows[0];
  }

  async getQueues(status = '') {
    let sql = `SELECT * FROM queues`;
    const params = [];
    if (status) {
      sql += ` WHERE status = $1`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC;`;
    const res = await query(sql, params);
    return res.rows;
  }

  async updateQueueStatus(id, status, errorMessage = null) {
    const res = await query(
      `UPDATE queues 
       SET status = $1::varchar, error_message = $2, processed_at = CASE WHEN $1::varchar IN ('COMPLETED', 'FAILED') THEN CURRENT_TIMESTAMP ELSE processed_at END, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *;`,
      [status, errorMessage, id]
    );
    return res.rows[0] || null;
  }
}

export const bookingService = new BookingService();
