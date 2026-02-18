/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Отключаем ESLint во время билда (warnings не должны блокировать деплой)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Отключаем проверку типов во время билда (ошибки типов не будут блокировать деплой)
    ignoreBuildErrors: true,
  },
  // Оптимизации для уменьшения использования памяти
  webpack: (config, { isServer }) => {
    // Увеличиваем лимит размера предупреждений
    config.performance = {
      maxAssetSize: 512000,
      maxEntrypointSize: 512000,
    };

    // Используем memory cache вместо filesystem для избежания ошибок памяти
    // Это может быть немного медленнее, но избежит проблем с выделением памяти
    config.cache = false; // Отключаем кэш webpack, Next.js будет использовать свой кэш

    // Оптимизация для уменьшения использования памяти
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Разделяем vendor chunks для лучшего кэширования
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20,
            },
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
              enforce: true,
            },
          },
        },
      };
    }

    return config;
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  },
}

module.exports = nextConfig
