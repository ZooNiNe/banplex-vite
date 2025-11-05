import { kv } from './kvClient.js';
import webpush from 'web-push';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('VAPID keys are not set. Push notifications will not work.');
}

export async function sendNotificationToUser(userId, payload) {
  if (!process.env.VAPID_PUBLIC_KEY) {
    console.error('Cannot send notification: VAPID keys are missing.');
    return;
  }
  
  try {
    const key = `subscriptions:${userId}`;
    const subscriptions = await kv.smembers(key);

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`No subscriptions found for user: ${userId}`);
      return;
    }

    const payloadString = JSON.stringify(payload);
    const sendPromises = subscriptions.map(subString => {
      const subscription = JSON.parse(subString);
      return webpush.sendNotification(subscription, payloadString)
        .catch(error => {
          if (error.statusCode === 410 || error.statusCode === 404) {
            console.log('Subscription expired or invalid. Removing...');
            kv.srem(key, subString); 
          } else {
            console.error(`Failed to send notification: ${error.statusCode}`);
          }
        });
    });

    await Promise.allSettled(sendPromises);
  } catch (error) {
    console.error(`Failed to send notifications for user ${userId}:`, error);
  }
}