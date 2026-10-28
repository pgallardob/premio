import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  functions: {
    api: {
      name: 'Los Olivos Premio API',
      source: './server/neon/index.js',
      env: {
        PUBLIC_URL: process.env.PUBLIC_URL,
        ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
        DEVICE_SECRET: process.env.DEVICE_SECRET,
        CREDENTIALS_ROTATED: process.env.CREDENTIALS_ROTATED,
        PROMOTION_REVIEWED: process.env.PROMOTION_REVIEWED ?? 'false',
        PROMOTION_CONTACT: process.env.PROMOTION_CONTACT ?? '',
      },
    },
  },
});
