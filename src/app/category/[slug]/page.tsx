import { TerminalDashboard } from '@/components/terminal/TerminalDashboard';

// Define the valid slugs based on the sidebar navigation
export function generateStaticParams() {
  return [
    { slug: 'technology' },
    { slug: 'healthcare' },
    { slug: 'crypto' },
    { slug: 'macro' },
    { slug: 'earnings' },
    { slug: 'fda' },
  ];
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  return <TerminalDashboard categorySlug={resolvedParams.slug} />;
}
