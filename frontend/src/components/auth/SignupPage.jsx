import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { sanitizeTextInput } from '../../utils/sanitize';

const passwordStrength = (password) => {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const labels = ['', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const colors = ['', '#DC2626', '#D97706', '#15803D', '#1D4ED8'];
  return { score, label: labels[score], color: colors[score] };
};

export default function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [portal, setPortal] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    address: 'Cairo, Egypt',
    password: '',
    confirmPassword: '',
    pin: '',
    confirmPin: '',
    adminSetupKey: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [passwordMeter, setPasswordMeter] = useState({ score: 0, label: '', color: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdAccount, setCreatedAccount] = useState('');

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const validateStep1 = () => {
    if (!portal) return 'Choose Customer Portal or Admin Portal first.';
    if (!form.fullName.trim()) return 'Full name is required.';
    if (!form.email.includes('@')) return 'Valid email is required.';
    if (!form.phone.trim()) return 'Phone number is required.';
    if (!form.dateOfBirth) return 'Date of birth is required.';
    return null;
  };

  const validateStep2 = () => {
    if (form.password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(form.password)) return 'Password must contain an uppercase letter.';
    if (!/[0-9]/.test(form.password)) return 'Password must contain a number.';
    if (!/[^A-Za-z0-9]/.test(form.password)) {
      return 'Password must contain a special character.';
    }
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    if (!/^\d{4}$/.test(form.pin)) return 'PIN must be exactly 4 digits.';
    if (form.pin !== form.confirmPin) return 'PINs do not match.';
    if (portal === 'admin' && !form.adminSetupKey.trim()) {
      return 'Admin setup key is required for admin registration.';
    }
    return null;
  };

  const handleNext = (event) => {
    event.preventDefault();
    const validationError = validateStep1();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setStep(2);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateStep2();

    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const nationalId = Date.now().toString().slice(-14).padStart(14, '0');
      const { data } = await api.post('/auth/register', {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        pin: form.pin,
        nationalId,
        phone: form.phone,
        dateOfBirth: form.dateOfBirth,
        address: form.address,
        role: portal,
        adminSetupKey: form.adminSetupKey,
      });

      setCreatedAccount(data.accountNumber);
      setStep(3);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          requestError.response?.data?.details?.[0]?.message ||
          'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: '2rem',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              color: '#fff',
              fontSize: 14,
            }}
          >
            SL
          </div>
          <span style={{ fontWeight: 700, fontSize: 18 }}>
            Safe<span style={{ color: 'var(--gold)' }}>Layers</span>
          </span>
        </div>

        {step < 3 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginBottom: '1.8rem',
            }}
          >
            {[1, 2].map((item) => (
              <React.Fragment key={item}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '.78rem',
                    fontWeight: 700,
                    background: step >= item ? 'var(--gold)' : 'var(--bg4)',
                    color: step >= item ? '#fff' : 'var(--text3)',
                    border: `2px solid ${step >= item ? 'var(--gold)' : 'var(--border)'}`,
                  }}
                >
                  {item}
                </div>
                {item < 2 && (
                  <div
                    style={{
                      width: 40,
                      height: 2,
                      background: step > item ? 'var(--gold)' : 'var(--border)',
                      borderRadius: 2,
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="card fade-up">
          {step === 1 && (
            <form onSubmit={handleNext}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '.3rem' }}>
                Create your account
              </h2>
              <p style={{ color: 'var(--text2)', fontSize: '.88rem', marginBottom: '1.5rem' }}>
                Step 1 of 2 - Personal information
              </p>

              {error && <div className="alert alert-error">{error}</div>}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  marginBottom: '1rem',
                }}
              >
                <div
                  style={{
                    border: portal === 'customer' ? '1px solid var(--green-lt)' : '1px solid var(--border)',
                    background: portal === 'customer' ? 'var(--green-dim)' : 'var(--surface)',
                    borderRadius: 12,
                    padding: '.85rem .9rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => setPortal('customer')}
                >
                  <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>Customer Portal</div>
                  <div style={{ fontSize: '.76rem', color: 'var(--text2)', lineHeight: 1.45 }}>
                    New signups create customer accounts for normal banking access.
                  </div>
                </div>

                <div
                  style={{
                    border: portal === 'admin' ? '1px solid var(--gold)' : '1px solid var(--border)',
                    background: portal === 'admin' ? 'var(--gold-dim)' : 'var(--surface)',
                    borderRadius: 12,
                    padding: '.85rem .9rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => setPortal('admin')}
                >
                  <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>Admin Portal</div>
                  <div style={{ fontSize: '.76rem', color: 'var(--text2)', lineHeight: 1.45 }}>
                    Create an admin account from the UI using an admin setup key.
                  </div>
                </div>
              </div>

              <div className="field">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Mariam Ahmed"
                  value={form.fullName}
                  onChange={(event) => setField('fullName', sanitizeTextInput(event.target.value))}
                  required
                />
              </div>

              <div className="field">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={form.email}
                  onChange={(event) => setField('email', event.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Phone Number</label>
                <input
                  type="text"
                  placeholder="+20 100 000 0000"
                  value={form.phone}
                  onChange={(event) => setField('phone', sanitizeTextInput(event.target.value))}
                  required
                />
              </div>

              <div className="field">
                <label>Date of Birth</label>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(event) => setField('dateOfBirth', event.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Address</label>
                <input
                  type="text"
                  placeholder="Cairo, Egypt"
                  value={form.address}
                  onChange={(event) => setField('address', sanitizeTextInput(event.target.value))}
                />
              </div>

              <button type="submit" className="btn btn-primary">
                Continue
              </button>
              <p
                style={{
                  textAlign: 'center',
                  marginTop: '1rem',
                  fontSize: '.82rem',
                  color: 'var(--text2)',
                }}
              >
                Already have an account?{' '}
                <Link to="/login" style={{ color: 'var(--gold)', fontWeight: 600 }}>
                  Sign in
                </Link>
              </p>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '.3rem' }}>
                Set up security
              </h2>
              <p style={{ color: 'var(--text2)', fontSize: '.88rem', marginBottom: '1.5rem' }}>
                Step 2 of 2 - Password and PIN
              </p>

              <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                Creating a <strong>{portal === 'admin' ? 'Admin' : 'Customer'}</strong> account.
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <div className="field">
                <label>Password</label>
                <div className="input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min 8 chars, uppercase, number, symbol"
                    value={form.password}
                    onChange={(event) => {
                      setField('password', event.target.value);
                      setPasswordMeter(passwordStrength(event.target.value));
                    }}
                    style={{ paddingRight: '3.5rem' }}
                    required
                  />
                  <button
                    type="button"
                    className="eye-btn"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {form.password && (
                  <>
                    <div className="str-bar">
                      <div
                        className="str-fill"
                        style={{
                          width: `${passwordMeter.score * 25}%`,
                          background: passwordMeter.color,
                        }}
                      />
                    </div>
                    <div className="str-hint" style={{ color: passwordMeter.color }}>
                      {passwordMeter.label}
                    </div>
                  </>
                )}
              </div>

              <div className="field">
                <label>Confirm Password</label>
                <input
                  type="password"
                  placeholder="Re-enter password"
                  value={form.confirmPassword}
                  onChange={(event) => setField('confirmPassword', event.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Transaction PIN</label>
                <div className="input-wrap">
                  <input
                    type={showPin ? 'text' : 'password'}
                    placeholder="****"
                    maxLength={4}
                    value={form.pin}
                    onChange={(event) =>
                      setField('pin', event.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    style={{
                      paddingRight: '3.5rem',
                      fontFamily: 'JetBrains Mono',
                      letterSpacing: 6,
                      fontSize: '1.1rem',
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="eye-btn"
                    onClick={() => setShowPin((current) => !current)}
                  >
                    {showPin ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="field">
                <label>Confirm PIN</label>
                <input
                  type="password"
                  placeholder="****"
                  maxLength={4}
                  value={form.confirmPin}
                  onChange={(event) =>
                    setField('confirmPin', event.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  style={{
                    fontFamily: 'JetBrains Mono',
                    letterSpacing: 6,
                    fontSize: '1.1rem',
                  }}
                  required
                />
              </div>

              {portal === 'admin' && (
                <div className="field">
                  <label>Admin Setup Key</label>
                  <input
                    type="password"
                    placeholder="Enter the admin setup key"
                    value={form.adminSetupKey}
                    onChange={(event) => setField('adminSetupKey', event.target.value)}
                    required
                  />
                  <div style={{ fontSize: '.72rem', color: 'var(--text3)', marginTop: 4 }}>
                    Demo default key: <span className="mono">safelayers-admin-demo</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '.75rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setStep(1);
                    setError('');
                  }}
                >
                  Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? (
                    <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  ) : (
                    'Create Account'
                  )}
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: '1rem' }}>OK</div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '.5rem' }}>
                Account created
              </h2>
              <p style={{ color: 'var(--text2)', fontSize: '.88rem', marginBottom: '1.5rem' }}>
                {portal === 'admin'
                  ? 'Your SafeLayers admin account is ready. Sign in from the Admin Portal and complete authenticator setup on first login.'
                  : 'Your SafeLayers customer account is ready. You will link your authenticator app on first login.'}
              </p>

              <div
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r)',
                  padding: '1.2rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div
                  style={{
                    fontSize: '.72rem',
                    color: 'var(--text2)',
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '.8px',
                    fontWeight: 700,
                  }}
                >
                  Your Account Number
                </div>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: 'var(--gold-lt)',
                    letterSpacing: 2,
                  }}
                >
                  {createdAccount}
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--text3)', marginTop: 6 }}>
                  Save this, you will need it to log in.
                </div>
              </div>

              {portal === 'customer' ? (
                <div className="alert alert-info" style={{ textAlign: 'left', marginBottom: '1.2rem' }}>
                  Your account comes with a <strong>Checking</strong> and <strong>Savings</strong>
                  {' '}account pre-created with demo balances.
                </div>
              ) : (
                <div className="alert alert-info" style={{ textAlign: 'left', marginBottom: '1.2rem' }}>
                  Use the <strong>Admin Portal</strong> on the login screen for this account. The admin console will open after authentication.
                </div>
              )}

              <button className="btn btn-primary" onClick={() => navigate('/login')}>
                Go to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
