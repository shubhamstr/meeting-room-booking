import { initDb, query, pool } from '../src/config/db.js';
import { bookingService } from '../src/services/bookingService.js';

async function verifyBookingSlotPersistence() {
  console.log('🧪 Running Verification for Static Slots & Database Persistence...\n');

  try {
    // 1. Check Database Schema
    console.log('Step 1: Initializing DB schema and checking time_slots table removal...');
    await initDb();

    const checkTable = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'time_slots'
      );
    `);
    const timeSlotsExists = checkTable.rows[0].exists;
    console.log(`   - time_slots table exists in PostgreSQL? ${timeSlotsExists} (Expected: false)`);

    if (timeSlotsExists) {
      throw new Error('time_slots table was not removed!');
    }

    // 2. Check bookings table columns (ensure start_time & end_time exist, and slot_id/slot_label are removed)
    console.log('\nStep 2: Checking bookings table schema for start_time & end_time columns and absence of slot_id & slot_label...');
    const colCheck = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bookings' AND column_name IN ('start_time', 'end_time', 'date', 'slot_id', 'slot_label');
    `);
    const existingCols = colCheck.rows.map(r => r.column_name);
    console.log('   - columns found in bookings:', existingCols);

    if (existingCols.includes('slot_id') || existingCols.includes('slot_label')) {
      throw new Error(`slot_id or slot_label column was not removed from bookings table! Found: ${existingCols.join(', ')}`);
    }
    if (!existingCols.includes('start_time') || !existingCols.includes('end_time') || !existingCols.includes('date')) {
      throw new Error('start_time, end_time, or date column is missing from bookings table!');
    }

    // 3. Test Static Slots Retrieval
    console.log('\nStep 3: Testing getAllSlots() (Static in-memory)...');
    const staticSlots = await bookingService.getAllSlots();
    console.log(`   - Retrieved ${staticSlots.length} static slots.`);
    console.log(`   - First slot:`, staticSlots[0]);
    console.log(`   - Last slot:`, staticSlots[staticSlots.length - 1]);

    // 4. Test Customer and Room resolution
    console.log('\nStep 4: Fetching customer and room to test booking creation...');
    const customers = await bookingService.getCustomers();
    const rooms = await bookingService.getRooms();

    if (customers.length === 0 || rooms.length === 0) {
      console.log('   - No customers or rooms found, creating test customer and room...');
      await bookingService.addCustomer({ name: 'Verification Client', email: 'verify@test.local', company: 'TestCorp' });
    }

    const testCust = (await bookingService.getCustomers())[0];
    const testRoom = rooms[0];

    console.log(`   - Using Customer: ${testCust.name} (${testCust.id})`);
    console.log(`   - Using Room: ${testRoom.name} (${testRoom.id})`);

    // 5. Test Room Availability
    console.log('\nStep 5: Testing getSlotsWithAvailability()...');
    const testDate = '2026-09-15';
    const availability = await bookingService.getSlotsWithAvailability(testRoom.id, testDate);
    console.log(`   - Total slots: ${availability.length}, Available: ${availability.filter(s => s.isAvailable).length}`);

    // 6. Create Booking & Verify Database Values
    console.log('\nStep 6: Creating booking with date, startTime, and endTime...');
    const newBooking = await bookingService.createBooking({
      customerId: testCust.id,
      roomId: testRoom.id,
      date: testDate,
      startTime: '10:00',
      endTime: '11:00',
      title: 'Sprint Planning & Strategy Session',
      attendees: 5,
      notes: 'Testing startTime and endTime db columns'
    });

    console.log('   - Booking created response:');
    console.log(`     ID:         ${newBooking.id}`);
    console.log(`     Date:       ${newBooking.date}`);
    console.log(`     StartTime:  ${newBooking.startTime}`);
    console.log(`     EndTime:    ${newBooking.endTime}`);
    console.log(`     Start ISO:  ${newBooking.start}`);
    console.log(`     End ISO:    ${newBooking.end}`);

    // 7. Directly Query Database to Verify Persistence in PostgreSQL Table
    console.log('\nStep 7: Directly querying PostgreSQL `bookings` table to verify stored columns...');
    const dbRow = await query(
      `SELECT id, customer_id, room_id, date, start_time, end_time, title, total_cost, status 
       FROM bookings WHERE id = $1;`,
      [newBooking.id]
    );

    console.log('   - Raw row from PostgreSQL:', dbRow.rows[0]);

    if (!dbRow.rows[0].start_time || !dbRow.rows[0].end_time || !dbRow.rows[0].date) {
      throw new Error('date, start_time, or end_time is missing in PostgreSQL row!');
    }

    // 8. Verify getBookings includes startTime & endTime
    console.log('\nStep 8: Testing getBookings() retrieval...');
    const bookingsList = await bookingService.getBookings({ date: testDate });
    const found = bookingsList.find(b => b.id === newBooking.id);
    console.log(`   - Found booking in list? ${!!found}`);
    console.log(`   - Stored Start Time: ${found.startTime}, End Time: ${found.endTime}, Date: ${found.date}`);

    // 9. Clean up test booking
    console.log('\nStep 9: Cancelling test booking...');
    await bookingService.cancelBooking(newBooking.id);
    console.log('   - Test booking cancelled successfully.');

    console.log('\n🎉 ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('\n❌ Verification Failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

verifyBookingSlotPersistence();
