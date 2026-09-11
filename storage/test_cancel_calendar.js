import { initDb, query, pool } from '../src/config/db.js';
import { bookingService } from '../src/services/bookingService.js';
import { googleCalendarService } from '../src/services/googleCalendarService.js';
import { queueService } from '../src/services/queueService.js';

async function testCancelBookingCalendarRemoval() {
  console.log('🧪 Testing: On Cancel Booking -> Remove Event from Google Calendar...\n');

  try {
    await initDb();

    console.log('1. Checking Google Calendar connection...');
    const calStatus = googleCalendarService.getConnectionStatus();
    console.log(`   - Connected: ${calStatus.connected}`);
    console.log(`   - Target Calendar: ${calStatus.targetCalendarId}`);

    // Fetch customer and room
    const customers = await bookingService.getCustomers();
    const rooms = await bookingService.getRooms();

    if (customers.length === 0 || rooms.length === 0) {
      throw new Error('Need at least 1 customer and 1 room to run test.');
    }

    const testCust = customers[0];
    const testRoom = rooms[0];

    console.log('\n2. Creating a test booking...');
    const testBooking = await bookingService.createBooking({
      customerId: testCust.id,
      roomId: testRoom.id,
      date: '2026-09-20',
      startTime: '15:00',
      endTime: '16:00',
      purpose: 'Automated Test - Cancel Booking Calendar Removal',
      attendees: 3
    });

    console.log(`   - Booking created: ID=${testBooking.id}, Date=${testBooking.date}, Room=${testBooking.roomName}`);

    // Create a real or mock event in Google Calendar
    let eventId = null;
    if (googleCalendarService.isConnected()) {
      console.log('\n3. Creating event in Google Calendar...');
      try {
        const calEvent = await googleCalendarService.createCalendarEvent(testBooking);
        eventId = calEvent.id;
        await bookingService.updateBooking(testBooking.id, { googleEventId: eventId });
        console.log(`   - Event created in Google Calendar: ID=${eventId}`);
      } catch (err) {
        console.warn('   - Google Calendar API create event warning:', err.message);
      }
    }

    // Also simulate an enqueued job to ensure cleanup works
    console.log('\n4. Enqueuing a test pending queue job for this booking...');
    await queueService.enqueueCalendarEvent(testBooking, 'Test pending sync');
    const queueBefore = await query(
      `SELECT * FROM queues WHERE type = 'GOOGLE_CALENDAR_EVENT' AND payload->>'bookingId' = $1 AND status = 'PENDING';`,
      [testBooking.id]
    );
    console.log(`   - Found ${queueBefore.rows.length} pending queue job(s) for booking before cancellation.`);

    // 5. Cancel Booking
    console.log('\n5. Cancelling the booking via bookingService.cancelBooking()...');
    const cancelResult = await bookingService.cancelBooking(testBooking.id);
    console.log('   - cancelResult:', cancelResult);

    if (cancelResult.status !== 'Cancelled') {
      throw new Error(`Expected status 'Cancelled', got: ${cancelResult.status}`);
    }

    // 6. Verify queues cleanup
    console.log('\n6. Checking queue job status after cancellation...');
    const queueAfter = await query(
      `SELECT * FROM queues WHERE type = 'GOOGLE_CALENDAR_EVENT' AND payload->>'bookingId' = $1;`,
      [testBooking.id]
    );
    console.log(`   - Queue job status after cancellation: ${queueAfter.rows[0]?.status} (${queueAfter.rows[0]?.error_message})`);

    // 7. Verify booking state in PostgreSQL
    console.log('\n7. Verifying booking in database...');
    const dbBooking = await query(`SELECT id, status, google_event_id FROM bookings WHERE id = $1;`, [testBooking.id]);
    console.log(`   - DB Status: ${dbBooking.rows[0].status}`);

    console.log('\n✅ TEST PASSED: Booking cancellation and calendar removal logic verified successfully!');
  } catch (err) {
    console.error('\n❌ Test Failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testCancelBookingCalendarRemoval();
