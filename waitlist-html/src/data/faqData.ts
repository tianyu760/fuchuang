export interface FAQItem {
  category: string;
  icon: string;
  question: string;
  answer: string;
  tags: string[];
  relatedQuestions: string[];
  helpfulCount: number;
}

export interface FAQResponse {
  faqs: FAQItem[];
}

export const FAQ_DATA_URL = '/data/faq-data.json';

export async function loadFAQData(fetcher: typeof fetch = fetch): Promise<FAQItem[]> {
  const resp = await fetcher(FAQ_DATA_URL);
  if (!resp.ok) {
    throw new Error(`FAQ data request failed: ${resp.status}`);
  }
  const payload = (await resp.json()) as FAQResponse;
  if (!payload || !Array.isArray(payload.faqs)) {
    throw new Error('Invalid FAQ payload');
  }
  return payload.faqs;
}

