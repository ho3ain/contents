import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

/* Async queries (`findBy*`, `waitFor`) default to 1s. On a loaded CI runner a
   large page can need longer to mount, which produced rare false failures.
   A longer ceiling does not slow passing tests — they resolve as soon as the
   element appears. */
configure({ asyncUtilTimeout: 5000 });
