import Nav from '@/src/components/Nav';
import PoolTableScene from '@/src/components/PoolTableScene';

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column' }}>
      <Nav />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', overflow: 'auto' }}>
        <PoolTableScene />
      </main>
    </div>
  );
}
