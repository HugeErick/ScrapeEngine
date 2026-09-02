import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    launchOptions: {
      executablePath: '/usr/bin/chromium',
    },
  },
});
