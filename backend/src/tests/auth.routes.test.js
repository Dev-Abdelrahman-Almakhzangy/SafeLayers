const {
  buildQuery,
  createMockUser,
  ensureTestEnv,
  fetchCsrfContext,
} = require('./testSupport');

ensureTestEnv();

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock('../models/User');
jest.mock('../models/Account');

const request = require('supertest');
const User = require('../models/User');
const Account = require('../models/Account');
const { app } = require('../server');
const { generateTotp } = require('../utils/totp');
const { encryptText } = require('../utils/crypto');

describe('backend auth routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('blocks state-changing auth requests that do not include a CSRF token', async () => {
    const response = await request(app).post('/api/auth/register').send({});

    expect(response.statusCode).toBe(403);
    expect(response.body.error).toBe('Invalid or missing CSRF token');
  });

  test('validates registration payloads when CSRF is present', async () => {
    const { csrfToken, cookies } = await fetchCsrfContext(app);

    const response = await request(app)
      .post('/api/auth/register')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send({
        fullName: 'A',
        email: 'bad-email',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details.length).toBeGreaterThan(0);
  });

  test('rejects registration when role is missing', async () => {
    const { csrfToken, cookies } = await fetchCsrfContext(app);

    const response = await request(app)
      .post('/api/auth/register')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send({
        fullName: 'Mariam Ahmed',
        email: 'mariam@example.com',
        password: 'Secure@123',
        pin: '1234',
        nationalId: '12345678901234',
        phone: '+201000000000',
        dateOfBirth: '2000-01-01',
        address: 'Cairo',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'role' }),
      ])
    );
  });

  test('registers a user and provisions default accounts', async () => {
    const { csrfToken, cookies } = await fetchCsrfContext(app);
    const createdUser = createMockUser({
      accountNumber: '233-126-0001',
      twoFactorEnabled: false,
    });

    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(createdUser);
    Account.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/auth/register')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send({
        fullName: 'Mariam Ahmed',
        email: 'mariam@example.com',
        role: 'customer',
        password: 'Secure@123',
        pin: '1234',
        nationalId: '12345678901234',
        phone: '+201000000000',
        dateOfBirth: '2000-01-01',
        address: 'Cairo',
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.accountNumber).toBe('233-126-0001');
    expect(Account.create).toHaveBeenCalledTimes(2);
  });

  test('registers an admin user when the admin setup key is valid', async () => {
    const { csrfToken, cookies } = await fetchCsrfContext(app);
    const createdUser = createMockUser({
      accountNumber: '233-126-9001',
      role: 'admin',
      twoFactorEnabled: false,
    });

    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(createdUser);
    Account.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/auth/register')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send({
        fullName: 'Admin User',
        email: 'admin@example.com',
        password: 'Secure@123',
        pin: '1234',
        nationalId: '12345678901234',
        phone: '+201000000000',
        dateOfBirth: '2000-01-01',
        address: 'Cairo',
        role: 'admin',
        adminSetupKey: 'safelayers-admin-demo',
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.role).toBe('admin');
    expect(Account.create).not.toHaveBeenCalled();
  });

  test('starts first-time login by returning authenticator setup data', async () => {
    const { csrfToken, cookies } = await fetchCsrfContext(app);
    const firstTimeUser = createMockUser({
      accountNumber: '233-126-0001',
      email: 'mariam@example.com',
      twoFactorEnabled: false,
      twoFactorSecret: undefined,
    });

    User.findOne.mockReturnValue(buildQuery(firstTimeUser, firstTimeUser));

    const response = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send({
        accountNumber: '233-126-0001',
        password: 'Secure@123',
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.requiresTwoFactorSetup).toBe(true);
    expect(response.body.preAuthToken).toBeDefined();
    expect(response.body.manualEntryKey).toBeDefined();
    expect(response.body.provisioningUri).toContain('otpauth://totp/');
    expect(firstTimeUser.save).toHaveBeenCalled();
  });

  test('blocks login for deactivated users', async () => {
    const { csrfToken, cookies } = await fetchCsrfContext(app);
    const deactivatedUser = createMockUser({
      accountNumber: '233-126-0001',
      isActive: false,
    });

    User.findOne.mockReturnValue(buildQuery(deactivatedUser, deactivatedUser));

    const response = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send({
        accountNumber: '233-126-0001',
        password: 'Secure@123',
      });

    expect(response.statusCode).toBe(403);
    expect(response.body.error).toMatch(/deactivated/i);
    expect(deactivatedUser.comparePassword).not.toHaveBeenCalled();
  });

  test('blocks TOTP verification if the user is deactivated after password step', async () => {
    const { csrfToken, cookies } = await fetchCsrfContext(app);
    const totpSecret = 'JBSWY3DPEHPK3PXP';
    const preAuthUser = createMockUser({
      accountNumber: '233-126-0001',
      email: 'mariam@example.com',
      twoFactorEnabled: true,
      twoFactorSecret: encryptText(totpSecret),
      refreshTokens: [],
      isActive: true,
    });
    const deactivatedUser = createMockUser({
      _id: preAuthUser._id,
      accountNumber: preAuthUser.accountNumber,
      email: preAuthUser.email,
      twoFactorEnabled: true,
      twoFactorSecret: encryptText(totpSecret),
      refreshTokens: [],
      isActive: false,
    });

    User.findOne.mockImplementation(() => buildQuery(preAuthUser, preAuthUser));
    User.findById.mockImplementation(() => buildQuery(deactivatedUser, deactivatedUser));

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send({
        accountNumber: '233-126-0001',
        password: 'Secure@123',
      });

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.body.requiresTwoFactor).toBe(true);

    const verifyResponse = await request(app)
      .post('/api/auth/verify-totp')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send({
        preAuthToken: loginResponse.body.preAuthToken,
        token: generateTotp(totpSecret),
      });

    expect(verifyResponse.statusCode).toBe(403);
    expect(verifyResponse.body.error).toMatch(/deactivated/i);
  });

  test('confirms authenticator setup and grants access to the current user endpoint', async () => {
    const { csrfToken, cookies } = await fetchCsrfContext(app);
    const setupUser = createMockUser({
      accountNumber: '233-126-0001',
      email: 'mariam@example.com',
      twoFactorEnabled: false,
      twoFactorSecret: undefined,
      refreshTokens: [],
    });

    User.findOne.mockImplementation(() => buildQuery(setupUser, setupUser));
    User.findById.mockImplementation(() => buildQuery(setupUser, setupUser));

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send({
        accountNumber: '233-126-0001',
        password: 'Secure@123',
      });

    const secret = loginResponse.body.manualEntryKey.replace(/\s/g, '');
    const totpToken = generateTotp(secret);

    const confirmResponse = await request(app)
      .post('/api/auth/setup-totp/confirm')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send({
        preAuthToken: loginResponse.body.preAuthToken,
        token: totpToken,
      });

    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.body.user.twoFactorEnabled).toBe(true);

    const authCookies = (confirmResponse.headers['set-cookie'] || []).map((cookie) =>
      cookie.split(';')[0]
    );

    const meResponse = await request(app)
      .get('/api/auth/me')
      .set('Cookie', authCookies);

    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.body.user.accountNumber).toBe('233-126-0001');
    expect(meResponse.body.user.twoFactorEnabled).toBe(true);
  });
});
