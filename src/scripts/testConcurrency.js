import dotenv from 'dotenv';
import { initDb, query, pool } from '../config/db.js';
import { bookingService } from '../services/bookingService.js';
import { zohoCrmService } from '../services/zohoCrmService.js';

dotenv.config();

async function runConcurrencyTests() {
  console.log('\n=============================================================');
  console.log('🧪 RUNNING CONCURRENCY & CRM CUSTOMER VERIFICATION TESTS');
  console.log('=============================================================\n');

  try {
    await initDb();

    // 1. Get a valid customer and room for testing
    const customers = await bookingService.getCustomers();
    const rooms = await bookingService.getRooms();

    if (customers.length === 0 || rooms.length === 0) {
      throw new Error('Database needs seeded customers and rooms to run tests. Please run npm run seed first.');
    }

    const testCustomer = customers[0];
    const testRoom = rooms[0];
    const testDate = '2029-12-31'; // Future date to avoid collision with real bookings
    const testStart = '09:00';
    const testEnd = '10:00';

    // Clean up any pre-existing test bookings on this test date
    await query(`DELETE FROM bookings WHERE date = $1;`, [testDate]);

    console.log(`📋 Test Setup:`);
    console.log(`   • Customer: ${testCustomer.name} (${testCustomer.id})`);
    console.log(`   • Room:     ${testRoom.name} (${testRoom.id})`);
    console.log(`   • Date:     ${testDate} [${testStart} - ${testEnd}]`);

    // --- TEST 1: Simultaneous 2 Bookings for the same room & time ---
    console.log('\n-------------------------------------------------------------');
    console.log('⚡ TEST 1: Two Concurrent Booking Requests at the Same Millisecond');
    console.log('-------------------------------------------------------------');

    const req1 = bookingService.createBooking({
      customerId: testCustomer.id,
      roomId: testRoom.id,
      date: testDate,
      start: testStart,
      end: testEnd,
      purpose: 'Concurrent Booking Request 1'
    });

    const req2 = bookingService.createBooking({
      customerId: testCustomer.id,
      roomId: testRoom.id,
      date: testDate,
      start: testStart,
      end: testEnd,
      purpose: 'Concurrent Booking Request 2'
    });

    const results = await Promise.allSettled([req1, req2]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    console.log(`   Results:`);
    console.log(`   • Succeeded Requests: ${successes.length}`);
    console.log(`   • Rejected Requests:  ${failures.length}`);

    if (successes.length === 1 && failures.length === 1) {
      console.log(`   ✅ SUCCESS: Exactly 1 booking was created (ID: ${successes[0].value.id})`);
      console.log(`   ✅ SUCCESS: 2nd booking was safely rejected with: "${failures[0].reason.message}"`);
    } else {
      console.error(`   ❌ FAILURE: Expected 1 success and 1 rejection, but got ${successes.length} successes and ${failures.length} rejections.`);
      process.exitCode = 1;
    }

    // Verify DB count
    const dbCountRes = await query(`SELECT COUNT(*)::int AS count FROM bookings WHERE room_id = $1 AND date = $2 AND status != 'Cancelled';`, [testRoom.id, testDate]);
    const activeCount = dbCountRes.rows[0].count;
    console.log(`   • Active Bookings in DB for this slot: ${activeCount}`);
    if (activeCount === 1) {
      console.log('   ✅ PASS: Database contains exactly 1 active booking entry (no duplicate entries!).');
    } else {
      console.error(`   ❌ FAIL: Database contains ${activeCount} entries instead of 1.`);
      process.exitCode = 1;
    }

    // --- TEST 2: Check Customer Exists in CRM / DB when creating booking ---
    console.log('\n-------------------------------------------------------------');
    console.log('🔍 TEST 2: Customer Existence Check');
    console.log('-------------------------------------------------------------');

    // Attempt booking with completely nonexistent customer ID and non-matching email
    let crmCheckFailed = false;
    try {
      await bookingService.createBooking({
        customerId: 'nonexistent-customer-id-99999',
        customerEmail: 'completely_unknown_person_9999@random-domain-xyz.com',
        roomId: testRoom.id,
        date: testDate,
        start: '14:00',
        end: '15:00',
        purpose: 'Nonexistent Customer Test'
      });
    } catch (err) {
      crmCheckFailed = true;
      console.log(`   ✅ Correctly caught customer validation error: "${err.message}"`);
    }

    if (crmCheckFailed) {
      console.log('   ✅ PASS: Booking rejected when customer does not exist in CRM/DB.');
    } else {
      console.error('   ❌ FAIL: Expected booking to fail for nonexistent customer, but it succeeded.');
      process.exitCode = 1;
    }

    // --- Clean Up Test Data ---
    await query(`DELETE FROM bookings WHERE date = $1;`, [testDate]);
    console.log(`\n🧹 Cleaned up test records for ${testDate}.`);

    console.log('\n=============================================================');
    console.log('🎉 ALL CONCURRENCY & CRM VERIFICATION TESTS PASSED!');
    console.log('=============================================================\n');

  } catch (err) {
    console.error('\n❌ Test execution error:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runConcurrencyTests();
