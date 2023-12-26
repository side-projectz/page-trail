import Redis from 'ioredis';
import { REDIS_URL } from './constants';

const $REDIS_CLIENT = new Redis(REDIS_URL);

// Method to get data from Redis
const getDataFromRedis = async (key) => {
  try {
    const data = await $REDIS_CLIENT.get(key);
    return data;
  } catch (error) {
    console.error('Error getting data from Redis:', error);
    throw error;
  }
};

// Method to set data in Redis
const setDataInRedis = async (key, value) => {
  try {
    if (value === null || value === undefined) {
      throw new Error('Value cannot be null or undefined');
    }
    if (typeof value !== 'string') {
      value = JSON.stringify(value);
    }
    await $REDIS_CLIENT.set(key, value);
    console.log('Data set in Redis successfully');
  } catch (error) {
    console.error('Error setting data in Redis:', error);
    throw error;
  }
};

export { getDataFromRedis, setDataInRedis };
