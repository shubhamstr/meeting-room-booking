# Turbosoft API

A modern, lightweight Node.js and Express.js REST API starter configured with ES Modules, environment management, and essential middleware.

---

## 🛠 Tech Stack

- **Runtime:** [Node.js](https://nodejs.org/) (ES Modules / `"type": "module"`)
- **Framework:** [Express.js](https://expressjs.com/) (v5)
- **CRM Integration:** [@zohocrm/nodejs-sdk-2.0](https://www.npmjs.com/package/@zohocrm/nodejs-sdk-2.0)
- **Templating Engine:** [EJS](https://ejs.co/)
- **Utilities & Middleware:**
  - [cors](https://www.npmjs.com/package/cors) - Cross-Origin Resource Sharing
  - [morgan](https://www.npmjs.com/package/morgan) - HTTP request logger
  - [dotenv](https://www.npmjs.com/package/dotenv) - Environment variable management
- **Development Tools:**
  - [nodemon](https://www.npmjs.com/package/nodemon) - Auto-restart dev server on file changes

---

## 📁 Project Structure

```text
turbosoft/
├── storage/                  # Persisted Zoho CRM SDK tokens and logs
│   ├── zoho_connection.json
│   └── zoho_sdk_tokens.txt
├── src/
│   ├── data/                 # Seed data and mock database
│   ├── middlewares/
│   │   └── errorHandler.js   # 404 and global error handling middleware
│   ├── routes/
│   │   ├── index.js          # Main customer and meeting room booking routes
│   │   └── zohoRoutes.js     # Zoho CRM OAuth, connect, status & sync endpoints
│   ├── services/
│   │   ├── bookingService.js # Customer & meeting room management service
│   │   └── zohoCrmService.js # Zoho CRM Node.js SDK 2.0 connection & API service
│   ├── views/                # EJS UI templates (customers, book, bookings, layout)
│   ├── app.js                # Express application setup & middleware configuration
│   └── server.js             # Server initialization & graceful shutdown
├── public/                   # Static CSS and JS assets
├── .env.example              # Template for environment variables
├── package.json              # Project dependencies and scripts
└── README.md                 # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) (v18 or higher recommended) and [npm](https://www.npmjs.com/) installed on your machine.

### Installation

1. **Clone the repository and navigate to the project directory:**
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
   # On Windows (PowerShell):
   Copy-Item .env.example .env

   # On Linux / macOS:
   cp .env.example .env
   ```

4. **Set your Zoho CRM credentials in `.env`:**
   ```env
   PORT=5000
   NODE_ENV=development
   ZOHO_API_CLIENT_ID=your_zoho_client_id
   ZOHO_API_CLIENT_SECRET=your_zoho_client_secret
   ZOHO_DATA_CENTER=INDataCenter
   ZOHO_REDIRECT_URI=http://localhost:5000/zoho/callback
   ```

---

## ⚡ Zoho CRM Integration

### OAuth Connection Flow
1. Open the application at `http://localhost:5000/` (redirects to `/customers`).
2. Click the **Connect Zoho CRM** button in the header navigation or the hero banner.
3. Select your Zoho Data Center region (India `.in`, US `.com`, EU `.eu`, AU `.com.au`, JP `.jp`).
4. Authorize access on Zoho's consent screen.
5. The application securely persists tokens using SDK's `FileStore` and connects to Zoho CRM.
6. Click **Sync Zoho CRM** to import CRM Contacts and Leads directly into the customer booking directory.

---

## 💻 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the server in development mode with **nodemon** (auto-reloads on changes) |
| `npm start` | Starts the server in production mode using **node** |

---

## 🔌 API & Route Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Root / Redirects to customer selection directory (`/customers`) |
| `GET` | `/customers` | Customer directory & selection view with Zoho CRM connection banner |
| `POST` | `/customers/new` | Quick-register a new customer profile |
| `GET` | `/book` | Interactive room selection & time slot picker |
| `POST` | `/book` | Confirm and create a meeting room reservation |
| `GET` | `/bookings` | View and filter all room reservations |
| `POST` | `/bookings/:id/cancel` | Cancel an existing booking reservation |
| `GET` | `/zoho/connect` | Initiates OAuth authorization with Zoho Accounts |
| `GET` | `/zoho/callback` | Handles OAuth redirect from Zoho and initializes SDK |
| `GET` | `/zoho/status` | Returns JSON status of Zoho CRM connection |
| `POST` | `/zoho/sync` | Syncs Contacts & Leads from Zoho CRM into Customer list |
| `POST` | `/zoho/token-connect` | Connects via developer Self-Client grant/refresh token |
| `POST` | `/zoho/disconnect` | Disconnects Zoho CRM and clears stored tokens |
| `GET` | `/health` | Server health check & uptime endpoint |

