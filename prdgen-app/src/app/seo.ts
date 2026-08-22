import { Metadata } from 'next';
import { APP_NAME, APP_DESCRIPTION } from '@/lib/constants';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://prdgenerator.id'),
  title: {
    default: `${APP_NAME} — Generate PRD dengan AI`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  keywords: [
    'PRD generator',
    'Product Requirements Document',
    'AI PRD',
    'generate PRD',
    'AI coding',
    'Cursor',
    'Windsurf',
    'Bolt',
    'development tools',
    'Indonesia',
  ],
  authors: [{ name: APP_NAME }],
  creator: APP_NAME,
  publisher: APP_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: '/',
    title: APP_NAME,
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_NAME,
    description: APP_DESCRIPTION,
    creator: '@prdgenerator',
  },
};
