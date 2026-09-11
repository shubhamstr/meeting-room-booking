# Turbosoft API & Meeting Room Booking System

A modern, high-performance Node.js and Express.js REST API and SSR web service built for meeting room reservations with external Zoho CRM customer synchronization and Google Calendar event management.

---

## 🛠 Tech Stack

- **Runtime:** [Node.js](https://nodejs.org/) (ES Modules / `"type": "module"`)
- **Framework:** [Express.js](https://expressjs.com/) (v5)
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

## 📁 Architecture & Route Separation

```text
turbosoft/
├── storage/                  # Persisted OAuth tokens for Zoho CRM and Google Calendar
│   ├── google_calendar_tokens.json
│   ├── zoho_connection.json
│   └── zoho_sdk_tokens.txt
├── src/
│   ├── data/                 # Seed data and mock database
│   ├── middlewares/
│   │   └── errorHandler.js   # 404 and global error handling middleware
│   ├── routes/
│   │   ├── frontendRoutes.js # Cleanly separated SSR view rendering routes (/, /customers, /book, /bookings)
│   │   ├── zohoRoutes.js     # Zoho CRM APIs (/api/zoho/*)
│   │   ├── calendarRoutes.js # Google Calendar APIs (/api/calendar/*)
│   │   └── apiRoutes.js      # Core resource APIs (/api/*)
│   ├── services/
│   │   ├── bookingService.js       # Customer & meeting room reservation service
│   │   ├── zohoCrmService.js       # Zoho CRM Node.js SDK 2.0 integration
│   │   └── googleCalendarService.js# Google Calendar OAuth2 & Events integration
│   ├── views/                # EJS UI templates (customers, book, bookings, layout)
│   ├── app.js                # Express app setup & route mounting
│   └── server.js             # Server entrypoint
├── public/                   # Static CSS and assets
├── .env.example              # Environment variables template
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) (v18 or higher recommended) and [npm](https://www.npmjs.com/) installed on your machine.

### Installation

1. **Navigate to the project directory:**
   ```bash
   cd turbosoft
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Copy the example environment configuration file to create your `.env` file:
   ```bash
   # Windows PowerShell:
   Copy-Item .env.example .env

   # Linux / macOS:
   cp .env.example .env
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

---

## 🔌 API & Route Endpoints

### 🖥️ 1. Frontend Web Routes (Separated Views)

| Method | Route | Description |
|---|---|---|
| `GET` | `/` | Root / Redirects to Integrations & Hub (`/customers`) |
| `GET` | `/customers` | Integrations hub (Zoho CRM & Google Calendar connection cards) |
| `POST` | `/customers/new` | Quick customer registration from UI |
| `GET` | `/book` | Interactive meeting room and time slot picker view |
| `POST` | `/book` | Submit reservation (automatically syncs to Google Calendar if connected) |
| `GET` | `/bookings` | Reservations directory & status management |
| `POST` | `/bookings/:id/cancel` | Cancel booking from UI (removes calendar event) |

---

### ⚡ 2. Zoho CRM APIs (`/api/zoho/*`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/zoho/connect` | Initiates Zoho OAuth 2.0 flow or returns authorization URL |
| `GET` | `/api/zoho/callback` | Handles OAuth redirect from Zoho and initializes SDK |
| `GET` | `/api/zoho/status` | Returns JSON status of Zoho CRM connection |
| `POST` | `/api/zoho/token-connect` | Connects via developer Self-Client grant/refresh token |
| `POST` | `/api/zoho/sync` | Syncs Contacts & Leads from Zoho CRM into local customer directory |
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
| `POST` | `/api/calendar/sync` | Bulk syncs all local confirmed bookings to Google Calendar |
| `POST` | `/api/calendar/disconnect` | Disconnects Google Calendar account |

---

### 🏢 4. Core Resource APIs (`/api/*`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health, uptime, and integration status check |
| `GET` | `/api/customers` | Get customer list with optional `?search=` filtering |
| `POST` | `/api/customers` | Create a new customer profile via API |
| `GET` | `/api/rooms` | List all meeting rooms (with optional `?minCapacity=`) |
| `GET` | `/api/rooms/:id/availability` | Query free & busy slots for a room on `?date=YYYY-MM-DD` |
| `GET` | `/api/slots` | Fetch time slots with availability for `?roomId=&date=` |
| `GET` | `/api/bookings` | List all bookings with query filters |
| `POST` | `/api/bookings` | Book a room (auto-creates Google Calendar event) |
| `POST` | `/api/bookings/:id/cancel` | Cancel booking (removes Google Calendar event) |
