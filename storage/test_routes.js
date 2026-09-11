import app from '../src/app.js';

const server = app.listen(5098);
const BASE = 'http://localhost:5098';

const testEndpoint = async (name, path, options = {}) => {
  try {
    const res = await fetch(BASE + path, options);
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json() : await res.text();
    console.log(`✅ [${res.status}] ${name} (${path}) ->`, isJson ? JSON.stringify(data).slice(0, 100) : data.slice(0, 60).replace(/\n/g, ' '));
    return { status: res.status, data };
  } catch (e) {
    console.error(`❌ ${name} failed:`, e.message);
  }
};

async function runTests() {
  console.log('--- TESTING BACKEND APIS ---');
  await testEndpoint('Health API', '/api/health');
  await testEndpoint('Zoho Status API', '/api/zoho/status');
  await testEndpoint('Zoho Connect API (JSON)', '/api/zoho/connect', { headers: { 'Accept': 'application/json' } });
  await testEndpoint('Calendar Status API', '/api/calendar/status');
  await testEndpoint('Calendar Connect API (JSON)', '/api/calendar/connect', { headers: { 'Accept': 'application/json' } });
  await testEndpoint('Customers API', '/api/customers');
  await testEndpoint('Rooms API', '/api/rooms');
  await testEndpoint('Room 1 Availability API', '/api/rooms/room-1/availability');
  await testEndpoint('Slots API', '/api/slots?roomId=room-1');
  
  const bookingRes = await testEndpoint('Create Booking API', '/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: 'cust-1',
      roomId: 'room-1',
      date: '2026-09-12',
      slotId: '09:00-10:00',
      title: 'Board Meeting with Enterprise Client',
      attendees: 4
    })
  });

  if (bookingRes?.data?.data?.id) {
    const bookingId = bookingRes.data.data.id;
    await testEndpoint('Cancel Booking API', `/api/bookings/${bookingId}/cancel`, { method: 'POST' });
  }

  console.log('\n--- TESTING FRONTEND ROUTES (SEPARATE) ---');
  await testEndpoint('Root Redirect', '/', { redirect: 'manual' });
  await testEndpoint('Customers View', '/customers');
  await testEndpoint('Book View', '/book?customerId=cust-1');
  await testEndpoint('Bookings View', '/bookings');

  server.close();
}

runTests();
