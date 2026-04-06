import Nav from '@/src/components/Nav';
import CombinedScene from '@/src/components/CombinedScene';

export default function GeneratePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column' }}>
      <Nav />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '24px', overflow: 'auto' }}>
        <CombinedScene />
      </main>
    </div>
  );
}
