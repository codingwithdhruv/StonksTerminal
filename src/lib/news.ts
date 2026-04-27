export * from './news/types';
export * from './news/utils';

import { CategoryClass, NewsItem } from './news/types';
import { categorizeNews as catHelper, getCategoryLabel as labelHelper, normalizeTimestamp as normHelper } from './news/utils';

// Backward compatibility exports
export const categorizeNews = catHelper;
export const getCategoryLabel = labelHelper;
export const normalizeTimestamp = normHelper;
export const NEWS_PLACEHOLDER = '/images/news-placeholder.png';
