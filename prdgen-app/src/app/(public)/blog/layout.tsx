import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Tips, tutorial, dan insight tentang PRD, AI coding, dan product development.',
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
