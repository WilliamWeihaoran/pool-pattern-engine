import LayoutDetailPage from '@/src/components/LayoutDetailPage';

export default function Page({ params }: { params: { id: string } }) {
  return <LayoutDetailPage id={params.id} />;
}
