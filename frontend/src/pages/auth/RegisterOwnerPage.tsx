import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Printer, Lock, Mail, User, Store, Loader2, AlertCircle } from 'lucide-react';
import { PhoneIntake } from '../../components/PhoneIntake';
import { apiRequest, setAuthToken } from '../../lib/api';

export const RegisterOwnerPage: React.FC = () => {
  const { t } = useTranslation(['auth', 'common']);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState(false);
  const [shopName, setShopName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPhoneValid || !name || !email || !shopName || !password || loading) return;

    if (password !== passwordConfirmation) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiRequest<{ token: string; user: any; shop: any }>('/auth/register-owner', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          phone,
          shop_name: shopName,
          password,
          password_confirmation: passwordConfirmation,
        }),
      });

      setAuthToken(res.data.token);
      navigate('/owner/shop');
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col justify-center py-10 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-white mx-auto shadow-md">
          <Printer className="w-7 h-7" />
        </div>
        <h2 className="mt-4 text-2xl font-extrabold text-ink tracking-tight">
          Create Print Shop Account
        </h2>
        <p className="mt-1 text-xs text-muted">
          Launch your automated walk-in print storefront in minutes
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-surface py-8 px-6 shadow-sm border border-border rounded-2xl sm:px-10">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-status-danger/20 rounded-lg p-3 flex items-start space-x-2 text-xs text-status-danger">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Owner Full Name
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Tanvir Chowdhury"
                  className="block w-full h-11 pl-10 pr-3 text-sm rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Print Shop Name
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                  <Store className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={shopName}
                  onChange={e => setShopName(e.target.value)}
                  placeholder="e.g. Modern Digital Print"
                  className="block w-full h-11 pl-10 pr-3 text-sm rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                {t('auth:email')}
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="owner@example.com"
                  className="block w-full h-11 pl-10 pr-3 text-sm rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
            </div>

            <PhoneIntake
              value={phone}
              onChange={(val, valid) => {
                setPhone(val);
                setIsPhoneValid(valid);
              }}
            />

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                {t('auth:password')}
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full h-11 pl-10 pr-3 text-sm rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                {t('auth:password_confirmation')}
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordConfirmation}
                  onChange={e => setPasswordConfirmation(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full h-11 pl-10 pr-3 text-sm rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isPhoneValid}
              className="w-full h-12 flex items-center justify-center space-x-2 rounded-xl bg-accent hover:bg-accent/90 text-white font-bold text-sm shadow transition-all cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <span>Register &amp; Launch Shop</span>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-muted">
            <span>Already have an account? </span>
            <Link to="/login" className="font-bold text-accent hover:underline">
              Log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
