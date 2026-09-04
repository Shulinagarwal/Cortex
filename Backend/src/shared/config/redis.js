const { Redis } = require("@upstash/redis");

let client = null;

const isRedisConfigured = () =>
  Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const getRedis = () => {
  if (!isRedisConfigured()) return null;
  if (!client) {
    client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return client;
};

const incrementCounter = async (key, windowSeconds) => {
  const redis = getRedis();
  if (!redis) return null;

  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count;
};

const getTimeToLive = async (key) => {
  const redis = getRedis();
  if (!redis) return null;
  const ttl = await redis.ttl(key);
  return ttl >= 0 ? ttl : null;
};

module.exports = { getRedis, isRedisConfigured, incrementCounter, getTimeToLive };
