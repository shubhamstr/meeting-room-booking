# Turbosoft API & Meeting Room Booking System

A modern, high-performance Node.js and Express.js REST API and SSR web service built for meeting room reservations with PostgreSQL persistence, external Zoho CRM customer synchronization, and Google Calendar event management.

---

## 🛠 Tech Stack

- **Runtime:** [Node.js](https://nodejs.org/) (ES Modules / `"type": "module"`)
- **Framework:** [Express.js](https://expressjs.com/) (v5)
- **Database:** [PostgreSQL](https://www.postgresql.org/) with [`pg`](https://www.npmjs.com/package/pg) connection pool
- **CRM Integration:** [@zohocrm/nodejs-sdk-2.0](https://www.npmjs.com/package/@zohocrm/nodejs-sdk-2.0)
- **Calendar Integration:** Google Calendar API v3
- **Templating Engine:** [EJS](https://ejs.co/)
- **Utilities & Middleware:**
  - [cors](https://www.npmjs.com/package/cors) - Cross-Origin Resource Sharing
  - [morgan](https://www.npmjs.com/package/morgan) - HTTP request logger
  - [dotenv](https://www.npmjs.com/package/dotenv) - Environment variable management
- **Development Tools:**
  - [nodemon](https://www.npmjs.com/package/nodemon) - Auto-restart dev server on file changes

---

## 🗄️ PostgreSQL Database & Schema Architecture

All mock data has been removed. Tables and indexes are defined directly in code in `src/config/db.js` and automatically checked/created upon server startup (`initDb()`):

### 1. `customers` Table
Stores live contacts and leads synced from Zoho CRM or added via API/UI.
- `id` (VARCHAR PRIMARY KEY)
- `zoho_id` (VARCHAR UNIQUE)
- `name` (VARCHAR NOT NULL)
- `email` (VARCHAR UNIQUE NOT NULL)
- `phone` (VARCHAR)
- `company` (VARCHAR)
- `department` (VARCHAR)
- `avatar` (TEXT)
- `initials` (VARCHAR)
- `badge_color` (VARCHAR)
- `source` (VARCHAR)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### 2. `rooms` Table
Maintains physical meeting room inventory.
- `id` (VARCHAR PRIMARY KEY)
- `name` (VARCHAR NOT NULL)
- `floor` (VARCHAR)
- `capacity` (INT NOT NULL)
- `hourly_rate` (NUMERIC NOT NULL)
- `type` (VARCHAR)
- `description` (TEXT)
- `image` (TEXT)
- `amenities` (JSONB)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### 3. `bookings` Table
Persisted reservations linked with foreign keys to customers and rooms with explicit date, start time, and end time.
- `id` (VARCHAR PRIMARY KEY, e.g. `BK-1001`)
- `customer_id` (VARCHAR REFERENCES customers(id) ON DELETE CASCADE)
- `room_id` (VARCHAR REFERENCES rooms(id) ON DELETE CASCADE)
- `date` (VARCHAR NOT NULL, e.g. `2026-09-12`)
- `start_time` (VARCHAR NOT NULL, e.g. `09:00`)
- `end_time` (VARCHAR NOT NULL, e.g. `10:00`)
- `title` (VARCHAR NOT NULL)
- `attendees` (INT DEFAULT 2)
- `notes` (TEXT)
- `total_cost` (NUMERIC NOT NULL)
- `status` (VARCHAR DEFAULT 'Confirmed')
- `google_event_id` (VARCHAR)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### 4. `queues` Table
Asynchronous job tracking for Zoho sync and external webhook tasks.
- `id` (VARCHAR PRIMARY KEY)
- `type` (VARCHAR NOT NULL, e.g. `ZOHO_SYNC`, `CALENDAR_SYNC`)
- `payload` (JSONB NOT NULL DEFAULT '{}')
- `status` (VARCHAR DEFAULT 'PENDING')
- `attempts` (INT DEFAULT 0)
- `max_attempts` (INT DEFAULT 3)
- `error_message` (TEXT)
- `processed_at` (TIMESTAMPTZ)
- `created_at` / `updated_at` (TIMESTAMPTZ)

*(Note: Time slots are managed statically in-memory via `src/config/timeSlots.js` for ultra-fast slot resolution without table lookups).*

---

## 📁 Architecture & Route Separation

```text
turbosoft/
├── storage/                  # Persisted OAuth tokens for Zoho CRM and Google Calendar
│   ├── google_calendar_tokens.json
│   ├── zoho_connection.json
│   └── zoho_sdk_tokens.txt
├── src/
│   ├── config/
│   │   └── db.js             # PostgreSQL Pool client, auto-migration & schema definition
│   ├── middlewares/
│   │   └── errorHandler.js   # 404 and global error handling middleware
│   ├── routes/
│   │   ├── frontendRoutes.js # Cleanly separated SSR view rendering routes (/, /customers, /book, /bookings)
│   │   ├── zohoRoutes.js     # Zoho CRM APIs (/api/zoho/*)
│   │   ├── calendarRoutes.js # Google Calendar APIs (/api/calendar/*)
│   │   └── apiRoutes.js      # Core resource APIs (/api/*)
│   ├── services/
│   │   ├── bookingService.js       # Customer & meeting room reservation service (PostgreSQL queries)
│   │   ├── zohoCrmService.js       # Zoho CRM Node.js SDK 2.0 integration & DB synchronization
│   │   └── googleCalendarService.js# Google Calendar OAuth2 & Events integration
│   ├── views/                # EJS UI templates (customers, book, bookings, layout)
│   ├── app.js                # Express app setup & route mounting
│   └── server.js             # Server entrypoint with DB initialization
├── public/                   # Static CSS and assets
├── .env.example              # Environment variables template
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/)
- [PostgreSQL](https://www.postgresql.org/) (running locally or remotely)

### Installation & Configuration

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables in `.env`:**
   ```env
   PORT=5000
   NODE_ENV=development

   # PostgreSQL Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=admin
   DB_NAME=meeting-room-bookings

   # Zoho CRM Integration
   ZOHO_API_CLIENT_ID=your_client_id
   ZOHO_API_CLIENT_SECRET=your_client_secret
   ZOHO_DATA_CENTER=USDataCenter
   ZOHO_REDIRECT_URI=http://localhost:5000/api/zoho/callback
   ```

3. **Run the seed script (generates 5 meeting rooms and 5 contacts in Zoho CRM & DB):**
   ```bash
   npm run seed
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   *Note: Upon startup, `initDb()` will automatically create tables (`customers`, `rooms`, `bookings`, `queues`) and verify schema integrity.*

---

## 🔌 API & Route Endpoints

### 🖥️ 1. Frontend Web Routes (Separated Views)

| Method | Route | Description |
|---|---|---|
| `GET` | `/` | Root / Redirects to Integrations & Hub (`/customers`) |
| `GET` | `/customers` | Integrations hub & PostgreSQL customer directory |
| `POST` | `/customers/new` | Quick customer registration saved to PostgreSQL |
| `GET` | `/book` | Interactive meeting room and time slot picker view |
| `POST` | `/book` | Submit reservation (saved to PostgreSQL & synced to Google Calendar) |
| `GET` | `/bookings` | Reservations directory & status management |
| `POST` | `/bookings/:id/cancel` | Cancel booking from UI (updates status in PostgreSQL & removes calendar event) |

---

### ⚡ 2. Zoho CRM APIs (`/api/zoho/*`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/zoho/connect` | Initiates Zoho OAuth 2.0 flow or returns authorization URL |
| `GET` | `/api/zoho/callback` | Handles OAuth redirect from Zoho and initializes SDK |
| `GET` | `/api/zoho/status` | Returns JSON status of Zoho CRM connection |
| `POST` | `/api/zoho/token-connect` | Connects via developer Self-Client grant/refresh token |
| `POST` | `/api/zoho/sync` | Syncs Contacts & Leads from Zoho CRM directly into PostgreSQL `customers` table |
| `POST` | `/api/zoho/disconnect` | Disconnects Zoho CRM and clears stored tokens |
| `GET` | `/api/zoho/contacts` | Directly queries contacts from Zoho CRM |

---

### 📅 3. Google Calendar APIs (`/api/calendar/*`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/calendar/connect` | Initiates Google Calendar OAuth 2.0 authorization URL |
| `GET` | `/api/calendar/callback` | Handles Google OAuth callback and token exchange |
| `GET` | `/api/calendar/status` | Returns JSON status of Google Calendar connection |
| `GET` | `/api/calendar/events` | Lists upcoming events from primary Google Calendar |
| `POST` | `/api/calendar/events` | Creates a calendar event for a meeting room booking |
| `DELETE`| `/api/calendar/events/:eventId` | Deletes a calendar event from Google Calendar |
| `POST` | `/api/calendar/sync` | Bulk syncs all local confirmed bookings from PostgreSQL to Google Calendar |
| `POST` | `/api/calendar/disconnect` | Disconnects Google Calendar account |

---

### 🏢 4. Core Resource APIs (`/api/*`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health, DB connectivity, uptime, and integration status |
| `GET` | `/api/customers` | Get customer list from PostgreSQL with optional `?search=` |
| `POST` | `/api/customers` | Create a new customer profile in PostgreSQL |
| `GET` | `/api/rooms` | List all meeting rooms (with optional `?minCapacity=`) |
| `GET` | `/api/rooms/:id/availability` | Query free & busy slots for a room on `?date=YYYY-MM-DD` |
| `GET` | `/api/slots` | Fetch time slots with availability for `?roomId=&date=` |
| `GET` | `/api/bookings` | List all bookings from PostgreSQL with query filters |
| `POST` | `/api/bookings` | Book a room in PostgreSQL (auto-creates Google Calendar event) |
| `POST` | `/api/bookings/:id/cancel` | Cancel booking (updates PostgreSQL & removes Google Calendar event) |
| `GET` | `/api/queues` | View background sync tasks and queue status (`PENDING`, `COMPLETED`, `FAILED`) |
