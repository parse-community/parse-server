import {InMemoryCache} from './Adapters/Cache/InMemoryCache';

export var AppCache = new InMemoryCache({ttl: NaN});
export default AppCache;
