require('dotenv').config();

const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const csurf = require('csurf');
const express = require('express');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const xssClean = require('xss-clean');

const connectDB = require('./config/database');
const logger = require('./config/logger');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const loanRoutes = require('./routes/loans');
const adminRoutes = require('./routes/admin');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const normalizeOrigin = (value, fallback) => {
  const raw = (value || '').trim();
  if (!raw) return fallback;

  let origin = raw.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(origin)) {
    origin = `https://${origin}`;
  }

  return origin;
};
const frontendOrigin = normalizeOrigin(process.env.FRONTEND_URL, 'http://localhost:3000');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);

const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', globalLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use(compression());

app.use(mongoSanitize());
app.use(xssClean());

app.use(
  csurf({
    cookie: {
      key: '_csrf',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
    },
    ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
  })
);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} â€” ${req.ip}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use(errorHandler);

const startServer = async () => {
  await connectDB();

  const port = process.env.PORT || 5000;
  return app.listen(port, () => {
    logger.info(`SafeLayers API running on port ${port} [${process.env.NODE_ENV}]`);
  });
};

if (require.main === module) {
  startServer().catch((error) => {
    logger.error(`Server startup failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
};
