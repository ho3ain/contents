import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useUnreadCount } from '../lib/notifications-sync';
import { useAuth } from '../context/AuthContext';
import { initials, formatMoney } from '../lib/format';
import { useToast } from './Toast';
import { useThemeMode } from '../theme';
import { AppIcon, MeshMark } from './ui';
import { useI18n, LOCALES, LOCALE_META, type Locale } from '../i18n';

export function Header() {
  const { user, isAuthenticated, isAdmin, isCreator, signOut, status } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { mode, toggleMode } = useThemeMode();
  const { locale, setLocale, t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // §14/§17 — scoped to the signed-in account; re-synced on route change,
  // visibility, bfcache restore and after every read/unread mutation
  // (src/lib/notifications-sync.ts).
  const userKey = user?.id ?? user?.email ?? null;
  const unread = useUnreadCount(userKey, isAuthenticated);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const closeMobile = () => setMobileOpen(false);

  const handleSignOut = async () => {
    setMenuOpen(false);
    setMobileOpen(false);
    // Leave the (possibly protected) page first. Otherwise the route guard
    // sees the guest state before we navigate and bounces the user to /login
    // with this page as the post-login destination — an explicit sign-out is
    // not a session expiry, so the next person to sign in must start fresh.
    navigate('/');
    await signOut();
    toast.info(t('nav.signedOut'));
  };

  const switchLocale = (next: Locale) => {
    if (next !== locale) setLocale(next);
  };

  const menuItems: Array<{ label: string; to: string }> = [];
  if (isAuthenticated) {
    menuItems.push({ label: t('nav.dashboard'), to: '/dashboard' });
    if (isCreator) menuItems.push({ label: t('nav.creatorStudio'), to: '/creator' });
    menuItems.push({ label: t('nav.myAgents'), to: '/library' });
    menuItems.push({ label: t('nav.favorites'), to: '/me/favorites' });
    menuItems.push({ label: t('disc.nav.follows'), to: '/me/follows' });
    menuItems.push({ label: t('nav.orders'), to: '/orders' });
    menuItems.push({ label: t('nav.myReviews'), to: '/me/reviews' });
    menuItems.push({ label: t('nav.profile'), to: '/settings' });
    menuItems.push({ label: t('nav.notifications'), to: '/me/notifications' });
    if (isAdmin) menuItems.push({ label: t('nav.adminConsole'), to: '/admin' });
  }

  return (
    <header className="header">
      <div className="container header__inner">
        <Link to="/" className="logo" onClick={closeMobile}>
          <MeshMark />
          <span className="logo__word">MESH</span>
        </Link>

        <nav className="nav" aria-label={t('a11y.primaryNav')}>
          <div className="row nav__links" style={{ gap: 'var(--sp-1)' }}>
            {(
              [
                ['/agents', 'nav.explore'],
                ['/categories', 'nav.categories'],
                ['/developers', 'nav.developers'],
                ['/blog', 'nav.blog'],
                ['/about', 'nav.about'],
                ['/contact', 'nav.contact'],
              ] as const
            ).map(([to, key]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `nav__link${isActive ? ' nav__link--active' : ''}`}
              >
                {({ isActive }) => (
                  <span aria-current={isActive ? 'page' : undefined}>{t(key)}</span>
                )}
              </NavLink>
            ))}
          </div>

          {isAuthenticated && status !== 'loading' && (
            <button
              className="btn btn--secondary btn--sm nav__toggle"
              style={{ marginInlineStart: 8 }}
              aria-label={t('a11y.toggleNav')}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              <AppIcon name={mobileOpen ? 'close' : 'menu'} size="xs" />
            </button>
          )}
          {!isAuthenticated && status !== 'loading' && (
            <button
              className="btn btn--secondary btn--sm nav__toggle"
              style={{ marginInlineStart: 8 }}
              aria-label={t('a11y.toggleNav')}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              <span aria-hidden="true">☰</span>
            </button>
          )}
        </nav>

        <div className="nav__account">
          <div
            className="lang-switch"
            role="group"
            aria-label={t('a11y.language')}
            style={{ display: 'flex', gap: 2, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 2 }}
          >
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => switchLocale(code)}
                aria-pressed={locale === code}
                className={`chip${locale === code ? ' chip--active' : ''}`}
                style={{ border: 'none', padding: '2px 8px', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                {code === 'fa' ? 'فا' : 'EN'}
                <span className="sr-only">{LOCALE_META[code].label}</span>
              </button>
            ))}
          </div>

          <button
            className="btn btn--ghost btn--sm"
            onClick={toggleMode}
            aria-label={mode === 'dark' ? t('a11y.lightMode') : t('a11y.darkMode')}
            style={{ fontSize: '1rem', padding: '6px 10px' }}
          >
            <AppIcon name={mode === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>

          {!isAuthenticated && status !== 'loading' ? (
            <>
              <Link to="/login" className="btn btn--ghost btn--sm">
                {t('nav.signIn')}
              </Link>
              <Link to="/register" className="btn btn--primary btn--sm">
                {t('nav.getStarted')}
              </Link>
            </>
          ) : isAuthenticated ? (
            <div className="row" style={{ gap: 8 }}>
              <Link
                to="/me/notifications"
                aria-label={t('a11y.notifications', {
                  count: formatMoney(unread),
                })}
                className="btn btn--ghost btn--sm"
                style={{ fontSize: '1rem', padding: '6px 10px' }}
              >
                <AppIcon name="bell" size={18} />
                {unread > 0 && (
                  <span className="badge badge--danger" style={{ marginInlineStart: -6, marginTop: -12 }}>
                    {unread > 9 ? t('nav.unreadMany') : formatMoney(unread)}
                  </span>
                )}
              </Link>
              <div className="menu" ref={menuRef}>
                <button
                  className="menu__button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={t('a11y.accountMenu')}
                >
                  <span className="avatar">{initials(user?.username ?? user?.email)}</span>
                </button>
                {menuOpen && (
                  <div className="menu__dropdown" role="menu">
                    <div className="menu__dropdown-head">
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }} className="ellipsis">
                        {user?.username ?? user?.email}
                      </div>
                      <div className="muted ellipsis">{user?.email}</div>
                    </div>
                    {menuItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="menu__item"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                    <div className="menu__divider" />
                    <button
                      className="menu__item"
                      role="menuitem"
                      onClick={handleSignOut}
                      style={{ color: 'var(--danger)' }}
                    >
                      {t('nav.signOut')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {mobileOpen && (
        <div className="container" style={{ paddingBottom: 12 }}>
          <div
            className="card"
            style={{ display: 'flex', flexDirection: 'column', padding: 8 }}
            role="navigation"
            aria-label={t('a11y.mobileNav')}
          >
            <NavLink
              to="/agents"
              className="nav__link"
              onClick={closeMobile}
              aria-current="page"
            >
              {t('nav.explore')}
            </NavLink>
            <NavLink to="/categories" className="nav__link" onClick={closeMobile}>
              {t('nav.categories')}
            </NavLink>
            <NavLink to="/developers" className="nav__link" onClick={closeMobile}>
              {t('nav.developers')}
            </NavLink>
            <NavLink to="/blog" className="nav__link" onClick={closeMobile}>
              {t('nav.blog')}
            </NavLink>
            <NavLink to="/about" className="nav__link" onClick={closeMobile}>
              {t('nav.about')}
            </NavLink>
            <NavLink to="/contact" className="nav__link" onClick={closeMobile}>
              {t('nav.contact')}
            </NavLink>
            {menuItems.map((item) => (
              <NavLink key={item.to} to={item.to} className="nav__link" onClick={closeMobile}>
                {item.label}
              </NavLink>
            ))}
            {isAuthenticated ? (
              <button
                className="nav__link"
                onClick={handleSignOut}
                style={{ textAlign: 'start' }}
              >
                {t('nav.signOut')}
              </button>
            ) : (
              <>
                <NavLink to="/login" className="nav__link" onClick={closeMobile}>
                  {t('nav.signIn')}
                </NavLink>
                <NavLink to="/register" className="nav__link" onClick={closeMobile}>
                  {t('nav.getStarted')}
                </NavLink>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
