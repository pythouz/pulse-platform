import { AccessToken } from 'livekit-server-sdk';

export default async function handler(req, res) {
  // السماح فقط بـ POST
  if (req.method !== 'POST') return res.status(405).end();

  const { roomName, participantName } = req.body;
  if (!roomName || !participantName) {
    return res.status(400).json({ error: 'Missing roomName or participantName' });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return res.status(500).json({ error: 'LiveKit env vars not set' });
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    name: participantName,
  });
  at.addGrant({ roomJoin: true, room: roomName });

  const token = await at.toJwt();
  res.status(200).json({ token, wsUrl });
}
