import { Router } from 'express';
import { bookingService } from '../services/bookingService.js';
import { getTodayDateString } from '../data/mockData.js';

const router = Router();

// Root route redirects to customer selection view
router.get('/', (req, res) => {
  res.redirect('/customers');
});

// 1. Customer Directory & Search View
router.get('/customers', (req, res) => {
  const searchQuery = req.query.search || '';
  const customers = bookingService.getCustomers(searchQuery);
  const stats = bookingService.getStats();

  res.render('customers', {
    customers,
    searchQuery,
    stats,
    selectedCustomer: null,
    successMessage: req.query.success || null,
    errorMessage: req.query.error || null
  });
});

// Quick-Add Customer
router.post('/customers/new', (req, res) => {
  try {
    const { name, email, company, department, phone } = req.body;
    if (!name || !email || !company) {
      return res.redirect('/customers?error=Name,+email,+and+company+are+required.');
    }

    const newCust = bookingService.addCustomer({ name, email, company, department, phone });
    // Immediately navigate to booking room for this newly created customer!
    res.redirect(`/book?customerId=${newCust.id}&success=Customer+profile+created+successfully.+Pick+a+room+to+proceed.`);
  } catch (err) {
    res.redirect(`/customers?error=${encodeURIComponent(err.message)}`);
  }
});

// 2. Room & Slot Picker View for Selected Customer
router.get('/book', (req, res) => {
  let customerId = req.query.customerId;
  const customers = bookingService.getCustomers();

  if (!customerId && customers.length > 0) {
    // If no customer chosen yet, redirect to customer directory first as requested
    return res.redirect('/customers?info=Please+select+a+customer+first+to+book+a+room.');
  }

  const customer = bookingService.getCustomerById(customerId) || customers[0];
  if (!customer) {
    return res.redirect('/customers?error=Customer+not+found.+Please+pick+a+valid+customer.');
  }

  const rooms = bookingService.getRooms();
  const roomId = req.query.roomId || (rooms[0] ? rooms[0].id : '');
  const selectedRoom = bookingService.getRoomById(roomId) || rooms[0];
  const selectedDate = req.query.date || getTodayDateString(0);
  const slots = bookingService.getSlotsWithAvailability(selectedRoom ? selectedRoom.id : '', selectedDate);

  res.render('book', {
    customer,
    rooms,
    selectedRoom,
    selectedDate,
    slots,
    successMessage: req.query.success || null,
    errorMessage: req.query.error || null
  });
});

// Handle Booking Submission
router.post('/book', (req, res) => {
  try {
    const { customerId, roomId, date, slotId, title, attendees, notes } = req.body;

    if (!customerId || !roomId || !date || !slotId) {
      return res.redirect(`/book?customerId=${customerId}&roomId=${roomId}&error=Please+complete+room+and+slot+selection.`);
    }

    const newBooking = bookingService.createBooking({
      customerId,
      roomId,
      date,
      slotId,
      title,
      attendees,
      notes
    });

    res.redirect(`/bookings?success=Meeting+room+booked+successfully!+Booking+Ref:+${newBooking.id}`);
  } catch (err) {
    const custId = req.body.customerId || '';
    const rId = req.body.roomId || '';
    res.redirect(`/book?customerId=${custId}&roomId=${rId}&error=${encodeURIComponent(err.message)}`);
  }
});

// 3. Bookings List & Overview
router.get('/bookings', (req, res) => {
  const { search, roomId, status, date } = req.query;
  const bookings = bookingService.getBookings({ search, roomId, status, date });
  const rooms = bookingService.getRooms();

  res.render('bookings', {
    bookings,
    rooms,
    filters: { search, roomId, status, date },
    selectedCustomer: null,
    successMessage: req.query.success || null,
    errorMessage: req.query.error || null
  });
});

// Cancel a Booking
router.post('/bookings/:id/cancel', (req, res) => {
  try {
    const { id } = req.params;
    bookingService.cancelBooking(id);
    res.redirect(`/bookings?success=Booking+${id}+has+been+cancelled.`);
  } catch (err) {
    res.redirect(`/bookings?error=${encodeURIComponent(err.message)}`);
  }
});

// 4. API Endpoints for dynamic client-side fetches
router.get('/api/slots', (req, res) => {
  const { roomId, date } = req.query;
  if (!roomId) {
    return res.status(400).json({ error: 'Room ID is required' });
  }
  const slots = bookingService.getSlotsWithAvailability(roomId, date);
  res.json({ slots });
});

router.get('/api/customers', (req, res) => {
  const searchQuery = req.query.search || '';
  const customers = bookingService.getCustomers(searchQuery);
  res.json({ customers });
});

// Health check route
router.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;
