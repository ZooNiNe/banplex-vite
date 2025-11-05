import Redis from 'ioredis';

let redisClient;
try {
  redisClient = new Redis(process.env.REDIS_URL, {
    connectTimeout: 10000,
    maxRetriesPerRequest: 3,
    enableReadyCheck: false // Opsi kompatibilitas
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Berhasil terhubung ke Redis Cloud.');
  });

} catch (error) {
  console.error('Gagal membuat klien Redis:', error);
}

export const kv = redisClient;