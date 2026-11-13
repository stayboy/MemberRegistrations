// Registers jest-dom's matchers with Vitest's `expect` types for the DOM lane.
// The setup file (`vitest.setup.dom.ts`) is outside `src`, so `tsc` never saw the
// augmentation and every `toHaveTextContent` was an error.
import '@testing-library/jest-dom/vitest';
