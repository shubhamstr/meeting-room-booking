# Turbosoft API

A modern, lightweight Node.js and Express.js REST API starter configured with ES Modules, environment management, and essential middleware.

---

## 🛠 Tech Stack

- **Runtime:** [Node.js](https://nodejs.org/) (ES Modules / `"type": "module"`)
- **Framework:** [Express.js](https://expressjs.com/) (v5)
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
├── src/
│   ├── middlewares/
│   │   └── errorHandler.js   # 404 and global error handling middleware
│   ├── routes/
│   │   └── index.js          # Route definitions (/ and /health)
│   ├── app.js                # Express application setup & middleware configuration
│   └── server.js             # Server initialization & graceful shutdown
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
   # On Linux/macOS/Git Bash:
   cp .env.example .env

   # On Windows (Command Prompt):
   copy .env.example .env

   # On Windows (PowerShell):
   Copy-Item .env.example .env
   ```

4. **Verify / update `.env` settings:**
   ```env
   PORT=5000
   NODE_ENV=development
   ```

---

## 💻 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the server in development mode with **nodemon** (auto-reloads on changes) |
| `npm start` | Starts the server in production mode using **node** |

---

## 🔌 API Endpoints

| Method | Endpoint | Description | Response Example |
|---|---|---|---|
| `GET` | `/` | Root / Welcome message | `{"success": true, "message": "Welcome to the API", "version": "1.0.0"}` |
| `GET` | `/health` | Server health check & uptime | `{"status": "UP", "timestamp": "...", "uptime": 12.34}` |

---

## 🛡 Error Handling

- **404 Not Found:** Automatically catches any unmatched routes and returns a JSON error response with status code `404`.
- **Centralized Error Handler:** Catches thrown errors and returns standard JSON responses with error message and stack trace (in development mode).
