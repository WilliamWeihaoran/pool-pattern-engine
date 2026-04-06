import CollectionDetailPage from '@/src/components/CollectionDetailPage';

export default function Page({ params }: { params: { id: string } }) {
  return <CollectionDetailPage id={params.id} />;
}
