import { query } from '../config/db.js';
import { googleCalendarService } from './googleCalendarService.js';
import { bookingService } from './bookingService.js';

class QueueService {
  constructor() {
    this.workerInterval = null;
    this.isProcessing = false;
    this.intervalMs = 30000; // 30 seconds periodic check
  }

  /**
   * Add a failed Google Calendar event job to the PostgreSQL queues table
   */
  async enqueueCalendarEvent(booking, errorMessage = null) {
    if (!booking || !booking.id) {
      console.warn('[QueueService] Cannot enqueue calendar event without a valid booking object.');
      return null;
    }

    const queueId = `Q-CAL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const payload = {
      bookingId: booking.id,
      customerId: booking.customerId || booking.customer_id,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerCompany: booking.customerCompany,
      roomId: booking.roomId || booking.room_id,
      roomName: booking.roomName,
      roomFloor: booking.roomFloor,
      roomType: booking.roomType,
      roomCapacity: booking.roomCapacity,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      title: booking.title || booking.purpose,
      attendees: booking.attendees,
      notes: booking.notes,
      totalCost: booking.totalCost
    };

    try {
      // Check if there is already an active PENDING queue entry for this booking
      const existing = await query(
        `SELECT id, attempts FROM queues 
         WHERE type = 'GOOGLE_CALENDAR_EVENT' 
           AND payload->>'bookingId' = $1 
           AND status = 'PENDING'
         LIMIT 1;`,
        [booking.id]
      );

      if (existing.rows.length > 0) {
        const updated = await query(
          `UPDATE queues 
           SET error_message = $1, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 
           RETURNING *;`,
          [errorMessage || 'Pending calendar sync', existing.rows[0].id]
        );
        return updated.rows[0];
      }

      const res = await query(
        `INSERT INTO queues (id, type, payload, status, attempts, max_attempts, error_message, created_at, updated_at)
         VALUES ($1, 'GOOGLE_CALENDAR_EVENT', $2, 'PENDING', 1, 5, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING *;`,
        [queueId, JSON.stringify(payload), errorMessage || 'Initial calendar event creation failed or pending authorization']
      );

      console.log(`[QueueService] Enqueued calendar event job ${queueId} for booking ${booking.id}. Reason: ${errorMessage || 'Failed sync'}`);
      return res.rows[0];
    } catch (err) {
      console.error('[QueueService] Error inserting into queues table:', err.message);
      return null;
    }
  }

  /**
   * Add a Google Calendar event deletion job to the PostgreSQL queues table (e.g. if calendar disconnected on cancel)
   */
  async enqueueCalendarDeleteEvent(bookingId, googleEventId, errorMessage = null) {
    if (!bookingId || !googleEventId) {
      return null;
    }

    const queueId = `Q-CAL-DEL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const payload = {
      bookingId,
      googleEventId
    };

    try {
      // Check if there is already a PENDING deletion job for this booking
      const existing = await query(
        `SELECT id, attempts FROM queues 
         WHERE type = 'GOOGLE_CALENDAR_DELETE_EVENT' 
           AND payload->>'bookingId' = $1 
           AND status = 'PENDING'
         LIMIT 1;`,
        [bookingId]
      );

      if (existing.rows.length > 0) {
        return existing.rows[0];
      }

      const res = await query(
        `INSERT INTO queues (id, type, payload, status, attempts, max_attempts, error_message, created_at, updated_at)
         VALUES ($1, 'GOOGLE_CALENDAR_DELETE_EVENT', $2, 'PENDING', 1, 5, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING *;`,
        [queueId, JSON.stringify(payload), errorMessage || 'Pending calendar event removal upon cancellation']
      );

      console.log(`[QueueService] Enqueued calendar delete job ${queueId} for booking ${bookingId} (Event: ${googleEventId})`);
      return res.rows[0];
    } catch (err) {
      console.error('[QueueService] Error inserting delete job into queues table:', err.message);
      return null;
    }
  }

  /**
   * Process all pending queues
   */
  async processPendingQueues() {
    if (this.isProcessing) {
      return { processed: 0, succeeded: 0, failed: 0, skipped: 0, message: 'Processing already in progress' };
    }

    this.isProcessing = true;
    const stats = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };

    try {
      // Fetch pending queue entries that haven't exceeded max_attempts
      const res = await query(
        `SELECT * FROM queues 
         WHERE status = 'PENDING' AND attempts < max_attempts 
         ORDER BY created_at ASC 
         LIMIT 50;`
      );

      const pendingJobs = res.rows;
      if (pendingJobs.length === 0) {
        this.isProcessing = false;
        return stats;
      }

      console.log(`[QueueWorker] Found ${pendingJobs.length} pending queue job(s) to process.`);

      for (const job of pendingJobs) {
        stats.processed++;
        const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;

        if (job.type === 'GOOGLE_CALENDAR_EVENT') {
          // If Google Calendar is not connected, leave job in PENDING state
          if (!googleCalendarService.isConnected()) {
            console.log(`[QueueWorker] Google Calendar is not connected. Job ${job.id} (Booking ${payload.bookingId}) remains PENDING.`);
            stats.skipped++;
            continue;
          }

          const bookingId = payload.bookingId;
          
          // Fetch current booking state from DB
          const bookingRes = await query(
            `SELECT 
               b.id,
               b.customer_id AS "customerId",
               c.name AS "customerName",
               c.email AS "customerEmail",
               c.company AS "customerCompany",
               b.room_id AS "roomId",
               r.name AS "roomName",
               r.floor AS "roomFloor",
               r.type AS "roomType",
               r.capacity AS "roomCapacity",
               b.date,
               b.start_time AS "startTime",
               b.end_time AS "endTime",
               b.title,
               b.attendees,
               b.notes,
               b.total_cost::float AS "totalCost",
               b.status,
               b.google_event_id AS "googleEventId"
             FROM bookings b
             JOIN customers c ON b.customer_id = c.id
             JOIN rooms r ON b.room_id = r.id
             WHERE b.id = $1;`,
            [bookingId]
          );

          if (bookingRes.rows.length === 0) {
            console.log(`[QueueWorker] Booking ${bookingId} not found in DB. Marking job ${job.id} as FAILED.`);
            await this.markJobFailed(job.id, 'Associated booking no longer exists.');
            stats.failed++;
            continue;
          }

          const currentBooking = bookingRes.rows[0];

          // If booking was cancelled, skip event creation
          if (currentBooking.status === 'Cancelled') {
            console.log(`[QueueWorker] Booking ${bookingId} was cancelled. Marking job ${job.id} as COMPLETED.`);
            await this.markJobCompleted(job.id, 'Booking was cancelled; calendar event creation skipped.');
            stats.succeeded++;
            continue;
          }

          // If booking already has a google_event_id
          if (currentBooking.googleEventId) {
            console.log(`[QueueWorker] Booking ${bookingId} already has calendar event ID ${currentBooking.googleEventId}. Marking job ${job.id} as COMPLETED.`);
            await this.markJobCompleted(job.id, `Already synced to Google Calendar (${currentBooking.googleEventId})`);
            stats.succeeded++;
            continue;
          }

          // Attempt creating the Google Calendar event
          try {
            const event = await googleCalendarService.createCalendarEvent(currentBooking);
            if (event && event.id) {
              await bookingService.updateBooking(bookingId, { googleEventId: event.id });
              await this.markJobCompleted(job.id, `Synced to Google Calendar: ${event.id}`);
              console.log(`[QueueWorker] Successfully created calendar event ${event.id} for booking ${bookingId} (Job: ${job.id})`);
              stats.succeeded++;
            } else {
              throw new Error('Google Calendar API returned no event ID');
            }
          } catch (err) {
            console.warn(`[QueueWorker] Error processing job ${job.id} for booking ${bookingId}:`, err.message);
            const newAttempts = (job.attempts || 0) + 1;
            if (newAttempts >= (job.max_attempts || 5)) {
              await this.markJobFailed(job.id, `Max retry attempts reached. Last error: ${err.message}`, newAttempts);
              stats.failed++;
            } else {
              await query(
                `UPDATE queues 
                 SET attempts = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3;`,
                [newAttempts, err.message, job.id]
              );
              stats.failed++;
            }
          }
        } else if (job.type === 'GOOGLE_CALENDAR_DELETE_EVENT') {
          // If Google Calendar is not connected, leave job in PENDING state
          if (!googleCalendarService.isConnected()) {
            console.log(`[QueueWorker] Google Calendar is not connected. Delete job ${job.id} (Booking ${payload.bookingId}) remains PENDING.`);
            stats.skipped++;
            continue;
          }

          try {
            const deleted = await googleCalendarService.deleteCalendarEvent(payload.googleEventId);
            await this.markJobCompleted(job.id, `Removed event ${payload.googleEventId} from Google Calendar`);
            console.log(`[QueueWorker] Successfully removed calendar event ${payload.googleEventId} for cancelled booking ${payload.bookingId} (Job: ${job.id})`);
            stats.succeeded++;
          } catch (err) {
            console.warn(`[QueueWorker] Error processing delete job ${job.id} for booking ${payload.bookingId}:`, err.message);
            const newAttempts = (job.attempts || 0) + 1;
            if (newAttempts >= (job.max_attempts || 5)) {
              await this.markJobFailed(job.id, `Max retry attempts reached. Last error: ${err.message}`, newAttempts);
              stats.failed++;
            } else {
              await query(
                `UPDATE queues 
                 SET attempts = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3;`,
                [newAttempts, err.message, job.id]
              );
              stats.failed++;
            }
          }
        }
      }
    } catch (err) {
      console.error('[QueueWorker] Error in processPendingQueues:', err.message);
    } finally {
      this.isProcessing = false;
    }

    return stats;
  }

  async markJobCompleted(id, note = null) {
    await query(
      `UPDATE queues 
       SET status = 'COMPLETED', 
           error_message = $1, 
           processed_at = CURRENT_TIMESTAMP, 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2;`,
      [note, id]
    );
  }

  async markJobFailed(id, errorMessage, attempts = null) {
    await query(
      `UPDATE queues 
       SET status = 'FAILED', 
           attempts = COALESCE($1, attempts), 
           error_message = $2, 
           processed_at = CURRENT_TIMESTAMP, 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3;`,
      [attempts, errorMessage, id]
    );
  }

  async getQueues({ status = '', type = '', limit = 50 } = {}) {
    let sql = `SELECT * FROM queues WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (status) {
      sql += ` AND status = $${idx++}`;
      params.push(status);
    }
    if (type) {
      sql += ` AND type = $${idx++}`;
      params.push(type);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${idx++};`;
    params.push(Math.max(1, parseInt(limit, 10) || 50));

    const res = await query(sql, params);
    return res.rows;
  }

  async retryJob(id) {
    const res = await query(
      `UPDATE queues 
       SET status = 'PENDING', attempts = 0, error_message = NULL, processed_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *;`,
      [id]
    );
    if (res.rows.length === 0) {
      throw new Error('Queue job not found');
    }

    // Trigger processing asynchronously
    setTimeout(() => {
      this.processPendingQueues().catch(err => console.error('[QueueWorker] Immediate retry trigger error:', err.message));
    }, 100);

    return res.rows[0];
  }

  startQueueWorker(intervalMs = 30000) {
    this.intervalMs = intervalMs;
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
    }

    console.log(`[QueueWorker] Background queue processor started (checks every ${this.intervalMs / 1000}s).`);

    // Check after 3 seconds of server startup
    setTimeout(() => {
      this.processPendingQueues().catch(e => console.warn('[QueueWorker] Initial check error:', e.message));
    }, 3000);

    this.workerInterval = setInterval(() => {
      this.processPendingQueues().catch(e => console.warn('[QueueWorker] Periodic check error:', e.message));
    }, this.intervalMs);
  }

  stopQueueWorker() {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
      console.log('[QueueWorker] Background queue processor stopped.');
    }
  }
}

export const queueService = new QueueService();
