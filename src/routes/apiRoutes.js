import { Router } from 'express';
import { bookingService, getTodayDateString } from '../services/bookingService.js';
import { googleCalendarService } from '../services/googleCalendarService.js';
import { zohoCrmService } from '../services/zohoCrmService.js';

const router = Router();

// 1. Health Check
router.get('/health', async (req, res) => {
  try {
    const stats = await bookingService.getStats();
    res.json({
      status: 'UP',
      service: 'TurboSpace Meeting Room Booking API',
      database: 'PostgreSQL Connected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      stats,
      integrations: {
        zoho: zohoCrmService.getConnectionStatus(),
        googleCalendar: googleCalendarService.getConnectionStatus()
      }
    });
  } catch (err) {
    res.status(500).json({
      status: 'DEGRADED',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
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

// 2. Customers API (with search and PostgreSQL persistence)
router.get('/customers', async (req, res) => {
  try {
    const searchQuery = req.query.search || '';
    const page = req.query.page ? parseInt(req.query.page, 10) : null;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;

    if (page || limit) {
      const result = await bookingService.getPaginatedCustomers({
        search: searchQuery,
        page: page || 1,
        limit: limit || 10
      });
      return res.json({
        success: true,
        count: result.customers.length,
        data: result.customers,
        ...result
      });
    }

    const customers = await bookingService.getCustomers(searchQuery);
    res.json({
      success: true,
      count: customers.length,
      total: customers.length,
      data: customers,
      customers: customers
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/customers', async (req, res) => {
  try {
    const { name, email, company } = req.body;
    if (!name || !email || !company) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and company are required.'
      });
    }

    const customer = await bookingService.addCustomer({ name, email, company });
    res.status(201).json({
      success: true,
      message: 'Customer added successfully to PostgreSQL',
      data: customer
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Rooms API & Availability
router.get('/rooms', async (req, res) => {
  try {
    const minCapacity = parseInt(req.query.minCapacity, 10) || 0;
    const search = req.query.search || '';
    const page = req.query.page ? parseInt(req.query.page, 10) : null;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;

    if (page || limit) {
      const result = await bookingService.getPaginatedRooms({
        search,
        minCapacity,
        page: page || 1,
        limit: limit || 6
      });
      return res.json({
        success: true,
        count: result.rooms.length,
        data: result.rooms,
        rooms: result.rooms,
        ...result
      });
    }

    const rooms = await bookingService.getRooms(minCapacity);
    res.json({
      success: true,
      count: rooms.length,
      total: rooms.length,
      data: rooms,
      rooms
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/rooms/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const date = req.query.date || getTodayDateString(0);

    const room = await bookingService.getRoomById(id);
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    const slots = await bookingService.getSlotsWithAvailability(id, date);
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
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dynamic Slots helper endpoint
router.get('/slots', async (req, res) => {
  try {
    const { roomId, date } = req.query;
    if (!roomId) {
      return res.status(400).json({ success: false, error: 'Room ID is required' });
    }
    const slots = await bookingService.getSlotsWithAvailability(roomId, date || getTodayDateString(0));
    res.json({ success: true, slots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Bookings API
router.get('/bookings', async (req, res) => {
  try {
    const { search, customerId, roomId, status, date } = req.query;
    const bookings = await bookingService.getBookings({ search, customerId, roomId, status, date });
    res.json({
      success: true,
      count: bookings.length,
      data: bookings
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/bookings', async (req, res) => {
  try {
    const customerId = req.body.customerId || req.body.customer_id || req.body['customer ID'] || req.body['customerId'] || req.body.customer;
    const roomId = req.body.roomId || req.body.room_id || req.body['room ID'] || req.body['roomId'] || req.body.room;
    const start = req.body.start || req.body.startTime || req.body.start_time || req.body['start time'];
    const end = req.body.end || req.body.endTime || req.body.end_time || req.body['end time'];
    const purpose = req.body.purpose || req.body.title || req.body.notes || 'Meeting Room Reservation';
    const date = req.body.date;
    const slotId = req.body.slotId || req.body.slot_id;
    const attendees = req.body.attendees;
    const notes = req.body.notes;

    if (!roomId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: room ID (or roomId) is required.'
      });
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

    // Auto-sync with Google Calendar if connected
    let calendarEvent = null;
    if (googleCalendarService.isConnected()) {
      try {
        calendarEvent = await googleCalendarService.createCalendarEvent(newBooking);
        if (calendarEvent && calendarEvent.id) {
          await bookingService.updateBooking(newBooking.id, { googleEventId: calendarEvent.id });
          newBooking.googleEventId = calendarEvent.id;
        }
      } catch (calErr) {
        console.warn('Failed to sync booking to Google Calendar automatically:', calErr.message);
      }
    }

    res.status(201).json({
      success: true,
      message: `Meeting room "${newBooking.roomName}" booked successfully for ${newBooking.slotLabel} on ${newBooking.date}!`,
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
    const allBookings = await bookingService.getBookings();
    const booking = allBookings.find(b => b.id === id);
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

    const updated = await bookingService.cancelBooking(id);
    res.json({
      success: true,
      message: `Booking ${id} cancelled successfully in PostgreSQL.`,
      data: updated
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 5. Queues API
router.get('/queues', async (req, res) => {
  try {
    const { status } = req.query;
    const queues = await bookingService.getQueues(status);
    res.json({
      success: true,
      count: queues.length,
      data: queues
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
