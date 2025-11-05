import { kv } from './kvClient.js';
import { verifyAuthToken } from './firebaseAdminHelper.js'; // Pastikan ini sudah benar

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  const authHeader = request.headers['authorization'] || null;
  
  const user = await verifyAuthToken(authHeader);

  if (!user || !user.uid) {
    return response.status(401).json({ error: 'Unauthorized' });
  }
  const userId = user.uid;
  
  try {
    const subscription = await request.body;
    if (!subscription || !subscription.endpoint) {
      return response.status(400).json({ error: 'Subscription data invalid' });
    }

    const key = `subscriptions:${userId}`;
    await kv.sadd(key, JSON.stringify(subscription));

    return response.status(201).json({ success: true });

  } catch (error) {
    console.error('Failed to save subscription:', error);
    return response.status(500).json({ error: 'Internal server error' });
  }
}