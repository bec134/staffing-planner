import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Page tests wait for IndexedDB writes and reloads; under a full, parallel
// run these can take longer than Testing Library's 1 s default.
configure({ asyncUtilTimeout: 3000 });

// Page tests don't close their database: the page may still be reloading
// after a test's last check, and a closed database would then throw. Each
// test uses its own in-memory database, so leaving it open is harmless.
