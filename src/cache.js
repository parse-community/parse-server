import { InMemoryCache } from './Adapters/Cache/InMemoryCache';

export const AppCache = new InMemoryCache({ ttl: NaN });
export default AppCache;
