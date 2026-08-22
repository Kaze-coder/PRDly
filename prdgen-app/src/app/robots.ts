import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://prdgenerator.id';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/account', '/checkout', '/prd', '/api'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
