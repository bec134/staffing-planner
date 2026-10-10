import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Page tests wait for IndexedDB writes and reloads; under a full, parallel
// run these can take longer than Testing Library's 1 s default.
configure({ asyncUtilTimeout: 3000 });
