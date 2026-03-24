const winston = require('winston');
const path = require('path');

// Custom format for audit trail
const auditFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
  })
);

const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info');

const logger = winston.createLogger({
  level: logLevel,
  format: auditFormat,
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        auditFormat
      ),
    }),
    // Audit log file — immutable event trail
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/audit.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      tailable: true,
    }),
    // Error log file
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
    }),
  ],
});

module.exports = logger;
