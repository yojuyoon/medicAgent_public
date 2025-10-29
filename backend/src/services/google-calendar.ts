import { google, calendar_v3 } from 'googleapis';
import type { FastifyBaseLogger } from 'fastify';

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  attendees?: Array<{ email: string; name?: string }>;
}

export interface FreeSlot {
  start: string;
  end: string;
}

export class GoogleCalendarService {
  private logger: FastifyBaseLogger;

  constructor(logger: FastifyBaseLogger) {
    this.logger = logger;
  }

  // Create Calendar client with user Access Token
  private createCalendarClient(accessToken: string) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    return google.calendar({
      version: 'v3',
      auth: oauth2Client,
    });
  }

  async findFreeSlots(
    accessToken: string,
    startDate: string,
    endDate: string,
    duration: number = 30
  ): Promise<FreeSlot[]> {
    try {
      const calendar = this.createCalendarClient(accessToken);

      // Query busy times from user primary calendar
      const freebusy = await calendar.freebusy.query({
        requestBody: {
          timeMin: startDate,
          timeMax: endDate,
          items: [{ id: 'primary' }],
        },
      });

      const busyTimes = freebusy.data.calendars?.primary?.busy || [];

      // Calculate free time slots
      const freeSlots = this.calculateFreeSlots(
        startDate,
        endDate,
        busyTimes,
        duration
      );

      this.logger.info(`Found ${freeSlots.length} free slots for user`);
      return freeSlots;
    } catch (error) {
      this.logger.error(`Error finding free slots: ${String(error)}`);
      throw new Error(
        `Failed to find free slots in calendar: ${String(error)}`
      );
    }
  }

  async createEvent(
    accessToken: string,
    event: CalendarEvent
  ): Promise<calendar_v3.Schema$Event> {
    try {
      const calendar = this.createCalendarClient(accessToken);

      const eventData: any = {
        summary: event.summary,
        start: event.start,
        end: event.end,
      };

      if (event.description) {
        eventData.description = event.description;
      }

      if (event.attendees) {
        eventData.attendees = event.attendees;
      }

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventData,
      });

      this.logger.info(`Created calendar event: ${response.data.id}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Error creating calendar event: ${String(error)}`);
      throw new Error(`Failed to create calendar event: ${String(error)}`);
    }
  }

  async getEvents(
    accessToken: string,
    startDate: string,
    endDate: string
  ): Promise<calendar_v3.Schema$Event[]> {
    try {
      const calendar = this.createCalendarClient(accessToken);

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startDate,
        timeMax: endDate,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      this.logger.info(`Retrieved ${events.length} events from calendar`);
      return events;
    } catch (error) {
      this.logger.error(`Error getting calendar events: ${String(error)}`);
      throw new Error(`Failed to retrieve calendar events: ${String(error)}`);
    }
  }

  async cancelEvent(accessToken: string, eventId: string): Promise<void> {
    try {
      const calendar = this.createCalendarClient(accessToken);

      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });

      this.logger.info(`Cancelled calendar event: ${eventId}`);
    } catch (error) {
      this.logger.error(`Error canceling calendar event: ${String(error)}`);
      throw new Error(`Failed to cancel calendar event: ${String(error)}`);
    }
  }

  // Validate Access Token
  async validateAccessToken(accessToken: string): Promise<boolean> {
    try {
      // Basic token format validation
      if (!accessToken || accessToken.length < 10) {
        this.logger.warn('Invalid token format');
        return false;
      }

      const calendar = this.createCalendarClient(accessToken);

      // Try a simple API call to validate token
      try {
        await calendar.calendarList.get({
          calendarId: 'primary',
        });
        return true;
      } catch (apiError: any) {
        // If it's a 401/403 error, token is invalid
        if (
          apiError?.response?.status === 401 ||
          apiError?.response?.status === 403
        ) {
          this.logger.warn('Token is invalid or expired');
          return false;
        }
        // For other errors (network, etc.), assume token is valid
        this.logger.warn(
          'Token validation failed due to network/API error, assuming valid'
        );
        return true;
      }
    } catch (error) {
      this.logger.warn('Token validation error:', error as any);
      return false;
    }
  }

  private calculateFreeSlots(
    startDate: string,
    endDate: string,
    busyTimes: calendar_v3.Schema$TimePeriod[],
    duration: number
  ): FreeSlot[] {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const freeSlots: FreeSlot[] = [];

    // Find free slots within 9AM-6PM range
    let currentTime = new Date(start);

    // Set start time to 9AM
    if (currentTime.getHours() < 9) {
      currentTime.setHours(9, 0, 0, 0);
    }

    while (currentTime < end) {
      const slotEnd = new Date(currentTime.getTime() + duration * 60000);

      // If past 6PM, move to next day 9AM
      if (slotEnd.getHours() >= 18) {
        currentTime.setDate(currentTime.getDate() + 1);
        currentTime.setHours(9, 0, 0, 0);
        continue;
      }

      // Check if overlapping with busy times
      const isOverlapping = busyTimes.some((busyTime) => {
        if (!busyTime.start || !busyTime.end) return false;
        const busyStart = new Date(busyTime.start);
        const busyEnd = new Date(busyTime.end);
        return currentTime < busyEnd && slotEnd > busyStart;
      });

      if (!isOverlapping) {
        freeSlots.push({
          start: currentTime.toISOString(),
          end: slotEnd.toISOString(),
        });
      }

      // Move to next slot (30-minute intervals)
      currentTime = new Date(currentTime.getTime() + duration * 60000);
    }

    return freeSlots;
  }

  // Helper function to convert natural language date/time to Date object
  parseNaturalDateTime(
    naturalTime: string,
    timezone: string = 'UTC'
  ): Date | null {
    try {
      const input = (naturalTime || '').toLowerCase().trim();
      const now = new Date();
      const daysOfWeek = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ];

      // 1) Absolute: YYYY-MM-DD[ HH:mm] or YYYY/MM/DD[ HH:mm]
      const abs = input.match(
        /(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ t](\d{1,2})(?::(\d{2}))?)?/
      );
      if (abs) {
        const [, y, m, d, hh, mm] = abs;
        return new Date(
          Number(y),
          Number(m) - 1,
          Number(d),
          hh ? Number(hh) : 14,
          mm ? Number(mm) : 0,
          0,
          0
        );
      }

      // Build base date: today/tomorrow/next <weekday>/plain weekday
      const base = new Date(now);
      if (/(^|\s)tomorrow(\s|$)/.test(input)) {
        base.setDate(base.getDate() + 1);
      } else if (/(^|\s)today(\s|$)/.test(input)) {
        // stay today
      } else {
        const next = input.match(
          /next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/
        );
        const plain = input.match(
          /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/
        );
        const wd = next?.[1] || plain?.[1];
        if (wd) {
          const target = daysOfWeek.indexOf(wd);
          const cur = now.getDay();
          let add = target - cur;
          if (add <= 0) add += 7;
          base.setDate(now.getDate() + add);
        }
      }

      // 2) Time: 5pm / 5:30 pm / 17:30
      const t12 = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
      const t24 = input.match(/\b(\d{1,2}):(\d{2})\b/);
      if (t12) {
        let h = parseInt(t12[1]!);
        const m = t12[2] ? parseInt(t12[2]) : 0;
        const mer = t12[3];
        if (mer === 'pm' && h !== 12) h += 12;
        if (mer === 'am' && h === 12) h = 0;
        base.setHours(h, m, 0, 0);
        return base;
      } else if (t24) {
        const h = parseInt(t24[1]!);
        const m = parseInt(t24[2]!);
        base.setHours(h, m, 0, 0);
        return base;
      }

      // 3) Default 14:00 if only day specified
      base.setHours(14, 0, 0, 0);
      return base;
    } catch (error) {
      this.logger.error(`Error parsing natural date time: ${String(error)}`);
      return null;
    }
  }
}
