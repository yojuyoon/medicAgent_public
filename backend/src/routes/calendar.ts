import type { FastifyPluginAsync } from 'fastify';
import axios from 'axios';

type CalendarEvent = {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  location?: string;
  description?: string;
};

const routes: FastifyPluginAsync = async (app) => {
  // Fetch events from Google Calendar using OAuth access token
  app.get('/events', async (req, reply) => {
    try {
      const auth = req.headers['authorization'];
      if (!auth || !auth.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Missing Bearer token' });
      }

      const accessToken = auth.substring('Bearer '.length);
      const timeMin = new Date().toISOString();
      const timeMax = new Date(
        Date.now() + 14 * 24 * 60 * 60 * 1000
      ).toISOString();

      const res = await axios.get(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          params: {
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 20,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const events: CalendarEvent[] = (res.data.items || []).map(
        (item: any) => ({
          id: item.id,
          title: item.summary || 'Untitled',
          start: item.start?.dateTime || item.start?.date,
          end: item.end?.dateTime || item.end?.date,
          location: item.location,
          description: item.description,
        })
      );

      return { events };
    } catch (err: any) {
      req.log.error({ err }, 'Failed to fetch Google Calendar events');
      const status = err?.response?.status || 500;
      const data = err?.response?.data || { error: 'Calendar fetch failed' };
      return reply.code(status).send(data);
    }
  });
};

export default routes;
