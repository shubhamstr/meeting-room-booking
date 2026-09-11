import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

import frontendRoutes from './routes/frontendRoutes.js';
import zohoRoutes from './routes/zohoRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import apiRoutes from './routes/apiRoutes.js';

import { zohoCrmService } from './services/zohoCrmService.js';
import { googleCalendarService } from './services/googleCalendarService.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();

// View engine setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use(express.static(path.join(rootDir, 'public')));

// Middlewares
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global locals for views
app.use((req, res, next) => {
  res.locals.zohoStatus = zohoCrmService.getConnectionStatus();
  res.locals.calendarStatus = googleCalendarService.getConnectionStatus();
  next();
});

// Backend API Routes (namespaced under /api)
app.use('/api/zoho', zohoRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api', apiRoutes);

// Frontend SSR Views Routes (separated)
app.use('/', frontendRoutes);

// Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
