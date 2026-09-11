import { Router } from 'express';
import { bookingService, getTodayDateString } from '../services/bookingService.js';
import { googleCalendarService } from '../services/googleCalendarService.js';

const router = Router();

// Root route redirects to customer selection view
router.get('/', (req, res) => {
  res.redirect('/customers');
});

// 1. Customer Directory & Integration View
router.get('/customers', async (req, res) => {
  try {
    const stats = await bookingService.getStats();

    res.render('customers', {
      searchQuery: req.query.search || '',
      stats,
      selectedCustomer: null,
      successMessage: req.query.success || null,
      errorMessage: req.query.error || null,
      infoMessage: req.query.info || null
    });
  } catch (err) {
    res.render('customers', {
      searchQuery: '',
      stats: { totalCustomers: 0, totalRooms: 0, activeBookings: 0, todayBookingsCount: 0, totalRevenue: 0 },
      selectedCustomer: null,
      successMessage: null,
      errorMessage: `Service error: ${err.message}`,
      infoMessage: null
    });
  }
});

// Quick-Add Customer Profile
router.post('/customers/new', async (req, res) => {
  try {
    const { name, email, company } = req.body;
    if (!name || !email || !company) {
      return res.redirect('/customers?error=Name,+email,+and+company+are+required.');
    }

    const newCust = await bookingService.addCustomer({ name, email, company });
    // Navigate to booking room for this newly created customer
    res.redirect(`/book?customerId=${newCust.id}&success=Customer+profile+created+successfully.+Pick+a+room+to+proceed.`);
  } catch (err) {
    res.redirect(`/customers?error=${encodeURIComponent(err.message)}`);
  }
});

// 2. Full-Screen Rooms Directory & Picker View
router.get('/rooms', async (req, res) => {
  try {
    const minCapacity = parseInt(req.query.minCapacity, 10) || 0;
    const rooms = await bookingService.getRooms(minCapacity);

    // If API client / AJAX request, return JSON
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.query.json === 'true') {
      return res.json({
        success: true,
        count: rooms.length,
        data: rooms
      });
    }

    let customerId = req.query.customerId;
    const customers = await bookingService.getCustomers();

    if (!customerId && customers.length > 0) {
      customerId = customers[0].id;
    }

    const customer = customerId ? await bookingService.getCustomerById(customerId) : null;

    res.render('rooms', {
      customer,
      customers,
      rooms,
      minCapacity,
      successMessage: req.query.success || null,
      errorMessage: req.query.error || null,
      infoMessage: req.query.info || null
    });
  } catch (err) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect(`/customers?error=${encodeURIComponent(err.message)}`);
  }
});

// Alias /book to /rooms for seamless navigation
router.get('/book', async (req, res) => {
  const customerId = req.query.customerId;
  const roomId = req.query.roomId;
  const date = req.query.date || getTodayDateString(0);

  if (roomId) {
    return res.redirect(`/rooms/${roomId}/availability?date=${date}${customerId ? `&customerId=${customerId}` : ''}`);
  }
  res.redirect(`/rooms${customerId ? `?customerId=${customerId}` : ''}`);
});

// 3. Room Availability & Free/Busy Slots View
router.get('/rooms/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const date = req.query.date || getTodayDateString(0);
    const customerId = req.query.customerId;

    const room = await bookingService.getRoomById(id);
    if (!room) {
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.query.json === 'true') {
        return res.status(404).json({ success: false, error: 'Room not found' });
      }
      return res.redirect('/rooms?error=Room+not+found');
    }

    const slots = await bookingService.getSlotsWithAvailability(id, date);
    const freeSlots = slots.filter(s => s.isAvailable);
    const busySlots = slots.filter(s => !s.isAvailable);

    // If API client / AJAX request, return JSON
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.query.json === 'true') {
      return res.json({
        success: true,
        room,
        date,
        slots,
        freeSlots,
        busySlots,
        totalSlots: slots.length,
        freeCount: freeSlots.length,
        busyCount: busySlots.length
      });
    }

    // Load customer context for booking
    const customers = await bookingService.getCustomers();
    let selectedCustomer = customerId ? await bookingService.getCustomerById(customerId) : (customers[0] || null);

    const allRooms = await bookingService.getRooms();

    res.render('room-availability', {
      room,
      allRooms,
      date,
      slots,
      freeSlots,
      busySlots,
      customer: selectedCustomer,
      customers,
      successMessage: req.query.success || null,
      errorMessage: req.query.error || null
    });
  } catch (err) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect(`/rooms?error=${encodeURIComponent(err.message)}`);
  }
});

// Handle Booking Submission (supports both API JSON and Form Redirects)
const handleBookingPost = async (req, res) => {
  const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.is('application/json');

  try {
    const customerId = req.body.customerId || req.body.customer_id || req.body['customer ID'] || req.body.customer;
    const roomId = req.body.roomId || req.body.room_id || req.body['room ID'] || req.body.room;
    const start = req.body.start || req.body.startTime || req.body.start_time;
    const end = req.body.end || req.body.endTime || req.body.end_time;
    const purpose = req.body.purpose || req.body.title || req.body.notes || 'Meeting Room Reservation';
    const date = req.body.date;
    const slotId = req.body.slotId || req.body.slot_id;
    const attendees = req.body.attendees;
    const notes = req.body.notes;

    if (!roomId) {
      if (isJson) {
        return res.status(400).json({ success: false, error: 'Room ID is required.' });
      }
      return res.redirect(`/rooms?error=Room+ID+is+required.`);
    }

    const newBooking = await bookingService.createBooking({
      customerId,
      roomId,
      start,
      end,
      purpose,
      date,
      slotId,
      title: purpose,
      attendees,
      notes
    });

    // Auto sync to Google Calendar if connected
    let calendarSuccessNotice = '';
    if (googleCalendarService.isConnected()) {
      try {
        const event = await googleCalendarService.createCalendarEvent(newBooking);
        if (event && event.id) {
          await bookingService.updateBooking(newBooking.id, { googleEventId: event.id });
          calendarSuccessNotice = '+Event+synced+to+Google+Calendar!';
          newBooking.googleEventId = event.id;
        }
      } catch (calErr) {
        console.warn('Google Calendar sync notice:', calErr.message);
      }
    }

    if (isJson) {
      return res.status(201).json({
        success: true,
        message: `Meeting room booked successfully!`,
        data: newBooking,
        calendarSynced: !!newBooking.googleEventId
      });
    }

    res.redirect(`/bookings?success=Meeting+room+booked+successfully!+Booking+Ref:+${newBooking.id}${calendarSuccessNotice}`);
  } catch (err) {
    if (isJson) {
      return res.status(400).json({ success: false, error: err.message });
    }
    const custId = req.body.customerId || '';
    const rId = req.body.roomId || '';
    const dt = req.body.date || getTodayDateString(0);
    res.redirect(`/rooms/${rId}/availability?date=${dt}&customerId=${custId}&error=${encodeURIComponent(err.message)}`);
  }
};

router.post('/book', handleBookingPost);
router.post('/bookings', handleBookingPost);

// 4. Bookings List & Overview
router.get('/bookings', async (req, res) => {
  try {
    const { search, customerId, roomId, status, date, startDate, endDate } = req.query;

    // If client requested JSON via Accept header or query param
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.query.json === 'true') {
      const bookings = await bookingService.getBookings({ search, customerId, roomId, status, date, startDate, endDate });
      return res.json({
        success: true,
        count: bookings.length,
        data: bookings
      });
    }

    const bookings = await bookingService.getBookings({ search, customerId, roomId, status, date, startDate, endDate });
    const rooms = await bookingService.getRooms();
    const customers = await bookingService.getCustomers();

    res.render('bookings', {
      bookings,
      rooms,
      customers,
      filters: { search, customerId, roomId, status, date, startDate, endDate },
      selectedCustomer: null,
      successMessage: req.query.success || null,
      errorMessage: req.query.error || null
    });
  } catch (err) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.query.json === 'true') {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.render('bookings', {
      bookings: [],
      rooms: [],
      customers: [],
      filters: { search: '', customerId: '', roomId: '', status: '', date: '', startDate: '', endDate: '' },
      selectedCustomer: null,
      successMessage: null,
      errorMessage: `Failed to load bookings: ${err.message}`
    });
  }
});

// Cancel a Booking
router.post('/bookings/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const allBookings = await bookingService.getBookings();
    const booking = allBookings.find(b => b.id === id);

    if (booking && booking.googleEventId && googleCalendarService.isConnected()) {
      try {
        await googleCalendarService.deleteCalendarEvent(booking.googleEventId);
      } catch (e) {
        console.warn('Could not delete calendar event:', e.message);
      }
    }

    await bookingService.cancelBooking(id);
    res.redirect(`/bookings?success=Booking+${id}+has+been+cancelled.`);
  } catch (err) {
    res.redirect(`/bookings?error=${encodeURIComponent(err.message)}`);
  }
});

export default router;
