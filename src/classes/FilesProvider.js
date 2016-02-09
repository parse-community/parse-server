import { default as BaseProvider } from './BaseProvider';

export class FilesProvider extends BaseProvider {
  constructor() {
    super(...arguments);
    this.DEFAULT_ADAPTER = '../GridStoreAdapter'
  }
}

export default new FilesProvider();