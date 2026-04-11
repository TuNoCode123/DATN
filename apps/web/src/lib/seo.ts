import type { Metadata } from 'next';

export const SITE_URL = 'https://web.neu-study.online';
export const SITE_NAME = 'NEU Study';
export const SITE_TITLE_DEFAULT =
  'NEU Study — AI-Powered IELTS, TOEIC & HSK Exam Prep';
export const SITE_TITLE_TEMPLATE = '%s | NEU Study';
export const SITE_DESCRIPTION =
  'AI-powered language exam preparation for IELTS, TOEIC, HSK and more. Free practice tests, smart flashcards, pronunciation coaching, and instant feedback on writing and speaking.';
export const SITE_KEYWORDS = [
  'IELTS practice test',
  'TOEIC practice test',
  'HSK practice test',
  'IELTS preparation',
  'TOEIC preparation',
  'HSK vocabulary',
  'AI pronunciation checker',
  'AI flashcards',
  'language learning app',
  'English exam prep',
  'Chinese exam prep',
];
export const SITE_LOCALE = 'en_US';
export const TWITTER_HANDLE = '@neustudy';

type BuildMetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noindex?: boolean;
  ogImage?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
};

export function buildMetadata({
  title,
  description,
  path,
  keywords,
  noindex,
  ogImage,
  type = 'website',
  publishedTime,
  modifiedTime,
}: BuildMetadataInput): Metadata {
  const url = new URL(path, SITE_URL).toString();
  const image = ogImage ?? '/opengraph-image';

  return {
    title,
    description,
    keywords: keywords ?? SITE_KEYWORDS,
    alternates: { canonical: url },
    robots: noindex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
            'max-snippet': -1,
            'max-video-preview': -1,
          },
        },
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      title,
      description,
      locale: SITE_LOCALE,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
      ...(type === 'article' && { publishedTime, modifiedTime }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      images: [image],
    },
  };
}

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    description: SITE_DESCRIPTION,
    sameAs: [
      'https://www.facebook.com/neustudy',
      'https://www.youtube.com/@neustudy',
      'https://twitter.com/neustudy',
    ],
  };
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: 'en-US',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function courseSchema(input: {
  name: string;
  description: string;
  path: string;
  provider?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: input.name,
    description: input.description,
    url: new URL(input.path, SITE_URL).toString(),
    provider: {
      '@type': 'Organization',
      name: input.provider ?? SITE_NAME,
      sameAs: SITE_URL,
    },
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: new URL(item.path, SITE_URL).toString(),
    })),
  };
}

export function faqSchema(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function articleSchema(input: {
  title: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
  author?: string;
  image?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    url: new URL(input.path, SITE_URL).toString(),
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    author: {
      '@type': 'Organization',
      name: input.author ?? SITE_NAME,
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon.png` },
    },
    image: input.image ?? `${SITE_URL}/opengraph-image`,
    mainEntityOfPage: new URL(input.path, SITE_URL).toString(),
  };
}

export function softwareAppSchema(input: {
  name: string;
  description: string;
  path: string;
  category?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: input.name,
    description: input.description,
    url: new URL(input.path, SITE_URL).toString(),
    applicationCategory: input.category ?? 'EducationalApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}

