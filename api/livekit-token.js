import { AccessToken } from 'livekit-server-sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { roomName, participantName } = req.body;
  if (!roomName || !participantName) {
    return res.status(400). json({ error: 'Missing roomName or participantName' });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL;

  console.log('[LiveKit Token] Env check:', {
    hasApiKey: !!apiKey,
    hasApiSecret: !!apiSecret,
    wsUrl: wsUrl || 'missing'
  });

  if (!apiKey || !apiSecret || !wsUrl) {
    console.error('Missing LiveKit environment variables');
    return res.status(500).json({ error: 'Server configuration error: missing LiveKit credentials' });
  }

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      name: participantName,
      ttl: 60 * 60,
    });
    at.addGrant({ roomJoin: true, room: roomName });

    const token = await at.toJwt();
    console.log(`✅ Token generated for ${participantName} in room ${roomName}`);
    res.status(200).json({ token, wsUrl });
  } catch (err) {
    console.error('Token generation error:', err);
    res.status(500).json({ error: 'Failed to generate token: ' + err.message });
  }
}
