const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const User = require('../models/User');
const Account = require('../models/Account');
const logger = require('../config/logger');
const { decryptText, encryptText } = require('../utils/crypto');
const {
  buildOtpAuthUrl,
  formatManualEntryKey,
  generateBase32Secret,
  verifyTotp,
} = require('../utils/totp');

const ACCESS_COOKIE_NAME = 'accessToken';
const REFRESH_COOKIE_NAME = 'refreshToken';

const isProduction = process.env.NODE_ENV === 'production';

const accessCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/',
  maxAge: 15 * 60 * 1000,
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const signToken = (id, sessionId) =>
  jwt.sign(
    { id, sessionId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );

const signRefreshToken = (id) =>
  jwt.sign(
    { id, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

const signPreAuthToken = (id) =>
  jwt.sign(
    { id, type: 'pre_auth' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_PREAUTH_EXPIRES_IN || '5m' }
  );

const verifyPreAuthToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  if (decoded.type !== 'pre_auth') {
    throw new Error('Invalid pre-auth token');
  }

  return decoded;
};

const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie(ACCESS_COOKIE_NAME, accessToken, accessCookieOptions);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
};

const clearAuthCookies = (res) => {
  res.clearCookie(ACCESS_COOKIE_NAME, {
    ...accessCookieOptions,
    maxAge: undefined,
  });
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...refreshCookieOptions,
    maxAge: undefined,
  });
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const generateAccountNumber = () => {
  const part1 = Math.floor(100 + Math.random() * 900);
  const part2 = Math.floor(100 + Math.random() * 900);
  const part3 = Math.floor(1000 + Math.random() * 9000);
  return `${part1}-${part2}-${part3}`;
};

const sendDeactivatedAccountResponse = (res) =>
  res.status(403).json({ error: 'Account is deactivated. Please contact an administrator.' });

const serializeUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  accountNumber: user.accountNumber,
  role: user.role,
  address: user.address,
  kycVerified: user.kycVerified,
  lastLogin: user.lastLogin,
  twoFactorEnabled: user.twoFactorEnabled,
});

const buildSetupPayload = (user, secret, preAuthToken) => ({
  message: 'Set up your authenticator app to continue.',
  role: user.role,
  requiresTwoFactorSetup: true,
  preAuthToken,
  manualEntryKey: formatManualEntryKey(secret),
  provisioningUri: buildOtpAuthUrl({
    issuer: 'SafeLayers',
    label: user.email || user.accountNumber,
    secret,
  }),
});

const issueAuthenticatedSession = async (user, req, res) => {
  const sessionId = uuidv4();
  const accessToken = signToken(user._id, sessionId);
  const refreshToken = signRefreshToken(user._id);
  const hashedRefreshToken = hashToken(refreshToken);

  user.lastLogin = new Date();
  user.lastLoginIp = req.ip;
  user.refreshTokens = [...(user.refreshTokens || []).slice(-4), hashedRefreshToken];
  await user.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, refreshToken);

  logger.info(`LOGIN SUCCESS: User ${user._id} from IP ${req.ip}`);

  return {
    message: 'Login successful',
    user: serializeUser(user),
  };
};

exports.getCsrfToken = (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
};

exports.register = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      pin,
      nationalId,
      phone,
      dateOfBirth,
      address,
      role,
      adminSetupKey,
    } = req.body;
    const requestedRole = typeof role === 'string' ? role.trim() : '';
    const expectedAdminSetupKey = process.env.ADMIN_SETUP_KEY || 'safelayers-admin-demo';

    if (!['customer', 'admin'].includes(requestedRole)) {
      logger.warn(`REGISTER DENIED: invalid role "${role}" from IP ${req.ip}`);
      return res.status(400).json({ error: 'A valid portal role is required.' });
    }

    if (requestedRole === 'admin' && adminSetupKey !== expectedAdminSetupKey) {
      logger.warn(`REGISTER DENIED: invalid admin setup key from IP ${req.ip}`);
      return res.status(403).json({ error: 'Invalid admin setup key.' });
    }

    let accountNumber;
    let exists = true;

    while (exists) {
      accountNumber = generateAccountNumber();
      exists = await User.findOne({ accountNumber });
    }

    const user = await User.create({
      fullName,
      email,
      password,
      pin,
      nationalId,
      phone,
      dateOfBirth,
      address,
      role: requestedRole,
      accountNumber,
      kycVerified: true,
      kycVerifiedAt: new Date(),
      twoFactorEnabled: false,
    });

    if (requestedRole === 'customer') {
      await Account.create({
        owner: user._id,
        accountNumber,
        type: 'checking',
        balance: 48250,
        dailyLimit: 20000,
      });

      await Account.create({
        owner: user._id,
        accountNumber: `${accountNumber}-SAV`,
        type: 'savings',
        balance: 112800,
        interestRate: 5.2,
        autoSave: true,
      });
    }

    logger.info(`REGISTER: New ${requestedRole} ${user._id} (${email}) registered`);

    res.status(201).json({
      message:
        requestedRole === 'admin'
          ? 'Admin account created successfully. Sign in through the Admin Portal.'
          : 'Account created successfully. Set up your authenticator app on first login.',
      accountNumber: user.accountNumber,
      role: requestedRole,
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { accountNumber, password } = req.body;

    const user = await User.findOne({ accountNumber }).select(
      '+password +twoFactorSecret +twoFactorTempSecret +twoFactorTempSecretCreatedAt'
    );

    if (user && !user.isActive) {
      logger.warn(`LOGIN DEACTIVATED: Account ${accountNumber} from IP ${req.ip}`);
      return sendDeactivatedAccountResponse(res);
    }

    if (user && user.isLocked) {
      logger.warn(`LOGIN LOCKED: Account ${accountNumber} from IP ${req.ip}`);
      return res.status(423).json({
        error: 'Account locked for 30 minutes due to failed attempts.',
      });
    }

    if (!user || !(await user.comparePassword(password))) {
      if (user) await user.incLoginAttempts();
      logger.warn(`LOGIN FAIL: ${accountNumber} from IP ${req.ip}`);
      return res.status(401).json({ error: 'Invalid account number or password.' });
    }

    if (user.loginAttempts > 0 || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save({ validateBeforeSave: false });
    }

    const preAuthToken = signPreAuthToken(user._id);

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      let setupSecret = null;
      const hasFreshTempSecret =
        user.twoFactorTempSecret &&
        user.twoFactorTempSecretCreatedAt &&
        user.twoFactorTempSecretCreatedAt > Date.now() - 15 * 60 * 1000;

      if (hasFreshTempSecret) {
        setupSecret = decryptText(user.twoFactorTempSecret);
      } else {
        setupSecret = generateBase32Secret();
        user.twoFactorTempSecret = encryptText(setupSecret);
        user.twoFactorTempSecretCreatedAt = new Date();
        await user.save({ validateBeforeSave: false });
      }

      logger.info(`LOGIN STEP1: ${user._id} requires authenticator setup`);
      return res.json(buildSetupPayload(user, setupSecret, preAuthToken));
    }

    logger.info(`LOGIN STEP1: ${user._id} password verified, awaiting authenticator code`);

    res.json({
      message: 'Enter the 6-digit code from your authenticator app.',
      role: user.role,
      requiresTwoFactor: true,
      preAuthToken,
    });
  } catch (error) {
    next(error);
  }
};

exports.confirmTotpSetup = async (req, res, next) => {
  try {
    const { preAuthToken, token } = req.body;
    const decoded = verifyPreAuthToken(preAuthToken);

    const user = await User.findById(decoded.id).select(
      '+twoFactorTempSecret +refreshTokens'
    );

    if (!user) {
      return res.status(400).json({
        error: 'Authenticator setup session is no longer valid. Please log in again.',
      });
    }

    if (!user.isActive) {
      logger.warn(`TOTP SETUP BLOCKED: User ${decoded.id} is deactivated`);
      return sendDeactivatedAccountResponse(res);
    }

    if (!user.twoFactorTempSecret) {
      return res.status(400).json({
        error: 'Authenticator setup session is no longer valid. Please log in again.',
      });
    }

    const secret = decryptText(user.twoFactorTempSecret);
    const isValid = verifyTotp(secret, token);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid authenticator code.' });
    }

    user.twoFactorSecret = user.twoFactorTempSecret;
    user.twoFactorTempSecret = undefined;
    user.twoFactorTempSecretCreatedAt = undefined;
    user.twoFactorEnabled = true;
    user.twoFactorConfirmedAt = new Date();

    const payload = await issueAuthenticatedSession(user, req, res);

    res.json({
      ...payload,
      message: 'Authenticator app linked successfully.',
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Setup session expired. Please log in again.' });
    }

    next(error);
  }
};

exports.verifyTotpLogin = async (req, res, next) => {
  try {
    const { preAuthToken, token } = req.body;
    const decoded = verifyPreAuthToken(preAuthToken);

    const user = await User.findById(decoded.id).select('+twoFactorSecret +refreshTokens');

    if (!user) {
      return res.status(400).json({
        error: 'Authenticator app is not configured for this account.',
      });
    }

    if (!user.isActive) {
      logger.warn(`TOTP LOGIN BLOCKED: User ${decoded.id} is deactivated`);
      return sendDeactivatedAccountResponse(res);
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({
        error: 'Authenticator app is not configured for this account.',
      });
    }

    const secret = decryptText(user.twoFactorSecret);
    const isValid = verifyTotp(secret, token);

    if (!isValid) {
      logger.warn(`TOTP FAIL: User ${user._id} from IP ${req.ip}`);
      return res.status(401).json({ error: 'Invalid authenticator code.' });
    }

    const payload = await issueAuthenticatedSession(user, req, res);
    res.json(payload);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Login session expired. Please try again.' });
    }

    next(error);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!refreshToken) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'No refresh token.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    if (decoded.type !== 'refresh') {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }

    const user = await User.findById(decoded.id).select('+refreshTokens');
    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'User not found.' });
    }

    if (!user.isActive) {
      clearAuthCookies(res);
      logger.warn(`REFRESH BLOCKED: User ${user._id} is deactivated`);
      return sendDeactivatedAccountResponse(res);
    }

    const hashedRefresh = hashToken(refreshToken);
    if (!user.refreshTokens.includes(hashedRefresh)) {
      await user.updateOne({ $set: { refreshTokens: [] } });
      clearAuthCookies(res);
      logger.warn(`REFRESH TOKEN REUSE: User ${user._id}`);
      return res.status(401).json({ error: 'Token reuse detected. Please log in again.' });
    }

    const sessionId = uuidv4();
    const newAccessToken = signToken(user._id, sessionId);
    const newRefreshToken = signRefreshToken(user._id);
    const newHashedRefresh = hashToken(newRefreshToken);

    user.refreshTokens = user.refreshTokens.filter((item) => item !== hashedRefresh);
    user.refreshTokens.push(newHashedRefresh);
    await user.save({ validateBeforeSave: false });

    setAuthCookies(res, newAccessToken, newRefreshToken);

    res.json({
      message: 'Session refreshed',
      user: serializeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (refreshToken && req.user) {
      const hashed = hashToken(refreshToken);
      await User.findByIdAndUpdate(req.user._id, {
        $pull: { refreshTokens: hashed },
      });
    }

    clearAuthCookies(res);
    logger.info(`LOGOUT: User ${req.user._id}`);
    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password +refreshTokens');

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    user.refreshTokens = [];
    await user.save();

    clearAuthCookies(res);

    logger.info(`PASSWORD CHANGED: User ${user._id}`);
    res.json({ message: 'Password updated. Please log in again.' });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
};
