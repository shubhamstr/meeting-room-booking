import { Router } from 'express';
import { bookingService } from '../services/bookingService.js';
import { googleCalendarService } from '../services/googleCalendarService.js';
import { zohoCrmService } from '../services/zohoCrmService.js';
import { getTodayDateString } from '../data/mockData.js';

const router = Router();

// 1. Health Check
router.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'TurboSpace Meeting Room Booking API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    integrations: {
      zoho: zohoCrmService.getConnectionStatus(),
      googleCalendar: googleCalendarService.getConnectionStatus()
    }
  });
});

// Alias for OAuth callback in case configured as /api/oauth (matching Google client secret JSON)
router.get('/oauth', (req, res) => {
  const queryStr = new URLSearchParams(req.query).toString();
  res.redirect(`/api/calendar/callback?${queryStr}`);
});

// Alias for Zoho redirect if configured as /api/zoho-redirect
router.get('/zoho-redirect', (req, res) => {
  const queryStr = new URLSearchParams(req.query).toString();
  res.redirect(`/api/zoho/callback?${queryStr}`);
});

// 2. Customers API (with search and caching support)
router.get('/customers', (req, res) => {
  const searchQuery = req.query.search || '';
  const customers = bookingService.getCustomers(searchQuery);
  res.json({
    success: true,
    count: customers.length,
    data: customers
  });
});

router.post('/customers', (req, res) => {
  try {
    const { name, email, company, department, phone } = req.body;
    if (!name || !email || !company) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and company are required.'
      });
    }

    const customer = bookingService.addCustomer({ name, email, company, department, phone });
    res.status(201).json({
      success: true,
      message: 'Customer added successfully',
      data: customer
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Rooms API & Availability
router.get('/rooms', (req, res) => {
  const minCapacity = parseInt(req.query.minCapacity, 10) || 0;
  const rooms = bookingService.getRooms(minCapacity);
  res.json({
    success: true,
    count: rooms.length,
    data: rooms
  });
});

router.get('/rooms/:id/availability', (req, res) => {
  const { id } = req.params;
  const date = req.query.date || getTodayDateString(0);

  const room = bookingService.getRoomById(id);
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }

  const slots = bookingService.getSlotsWithAvailability(id, date);
  const freeSlots = slots.filter(s => s.isAvailable);
  const busySlots = slots.filter(s => !s.isAvailable);

  res.json({
    success: true,
    room,
    date,
    slots,
    freeSlots,
    busySlots
  });
});

// Dynamic Slots helper endpoint
router.get('/slots', (req, res) => {
  const { roomId, date } = req.query;
  if (!roomId) {
    return res.status(400).json({ success: false, error: 'Room ID is required' });
  }
  const slots = bookingService.getSlotsWithAvailability(roomId, date || getTodayDateString(0));
  res.json({ success: true, slots });
});

// 4. Bookings API
router.get('/bookings', (req, res) => {
  const { search, customerId, roomId, status, date } = req.query;
  const bookings = bookingService.getBookings({ search, customerId, roomId, status, date });
  res.json({
    success: true,
    count: bookings.length,
    data: bookings
  });
});

router.post('/bookings', async (req, res) => {
  try {
    const { customerId, roomId, date, slotId, title, attendees, notes } = req.body;

    if (!customerId || !roomId || !date || !slotId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerId, roomId, date, and slotId are required.'
      });
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

    // Auto-sync with Google Calendar if connected
    let calendarEvent = null;
    if (googleCalendarService.isConnected()) {
      try {
        calendarEvent = await googleCalendarService.createCalendarEvent(newBooking);
        if (calendarEvent && calendarEvent.id) {
          bookingService.updateBooking(newBooking.id, { googleEventId: calendarEvent.id });
          newBooking.googleEventId = calendarEvent.id;
        }
      } catch (calErr) {
        console.warn('Failed to sync booking to Google Calendar automatically:', calErr.message);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Meeting room booked successfully!',
      data: newBooking,
      calendarSynced: !!newBooking.googleEventId
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

router.post('/bookings/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const booking = bookingService.getBookings().find(b => b.id === id);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    // If there is an associated Google Calendar event, remove it
    if (booking.googleEventId && googleCalendarService.isConnected()) {
      try {
        await googleCalendarService.deleteCalendarEvent(booking.googleEventId);
      } catch (e) {
        console.warn('Could not delete calendar event:', e.message);
      }
    }

    const updated = bookingService.cancelBooking(id);
    res.json({
      success: true,
      message: `Booking ${id} cancelled successfully.`,
      data: updated
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
