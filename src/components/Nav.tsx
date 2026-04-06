'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Nav() {
  const path = usePathname();
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 24px',
        borderBottom: '1px solid #21262d',
        background: '#0d1117',
      }}
    >
      <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: 14, letterSpacing: '0.02em' }}>
        Pool Pattern Engine
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
        <NavLink href="/"            active={path === '/'}>           Table       </NavLink>
        <NavLink href="/generate"    active={path === '/generate'}>   Generate    </NavLink>
        <NavLink href="/collections" active={path === '/collections'}>Collections </NavLink>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: '5px 14px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        textDecoration: 'none',
        background: active ? '#1e4a6e' : 'transparent',
        color: active ? '#fff' : '#8b949e',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </Link>
  );
}
