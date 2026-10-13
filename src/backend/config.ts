import {createBackend} from './client';
import {publicBackendConfig} from './environment';
export const backend = createBackend(publicBackendConfig);
