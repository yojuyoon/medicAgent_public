import type { FastifyBaseLogger } from 'fastify';
import type { LLMService } from '../../services/llm';
import { BaseAgent } from '../base/BaseAgent';
import type { AgentInput, AgentOutput } from '../base/AgentTypes';
import type { CalendarEvent } from '../../services/google-calendar';
import { GoogleCalendarService } from '../../services/google-calendar';
import { supabaseAdmin } from '../../lib/supabase';

export class AppointmentAgent extends BaseAgent {
  private calendarService: GoogleCalendarService;

  constructor(llm: LLMService, logger: FastifyBaseLogger) {
    super(llm, logger, 'appointment');
    this.calendarService = new GoogleCalendarService(logger);
  }

  getCapabilities() {
    return ['find_free_slots', 'create_event', 'cancel_event', 'get_events'];
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    try {
      // Check if user has Google Calendar access token in metadata
      const accessToken = input.metadata?.googleAccessToken;

      // Check if we have a valid Google Calendar token
      if (!accessToken || accessToken === 'test-token') {
        return {
          reply:
            "To manage your calendar appointments, please connect your Google account first. I can help you with appointment information, but I'll need calendar access to book appointments directly.",
          actions: [{ type: 'auth_required', status: 'pending' }],
          followups: [
            {
              type: 'question',
              text: 'Would you like me to guide you through connecting your Google Calendar?',
            },
          ],
        };
      }

      const systemPrompt = `You are a helpful medical appointment booking assistant with access to the user's Google Calendar.
      You can:
      - Find available time slots in their calendar
      - Book appointments directly to their calendar  
      - Check existing appointments
      - Cancel appointments
      
      When users request appointments, extract date/time information and suggest available slots.
      Be helpful and professional. Always confirm appointment details before booking.`;

      const userMessage = input.message;

      // Use LLM to understand user intent
      let usageTotalTokens: number | undefined;
      let intentText: string;
      if (this.llm.generateWithUsage) {
        const { text, usage } = await this.llm.generateWithUsage(
          `${systemPrompt}\n\nAnalyze this user message and determine the intent:
        "${userMessage}"
        
        Respond with one of: BOOK_APPOINTMENT, FIND_SLOTS, GET_EVENTS, CANCEL_EVENT, or GENERAL_CHAT`,
          { temperature: 0.1 }
        );
        intentText = text;
        usageTotalTokens = usage?.totalTokens;
      } else {
        intentText = await this.llm.generate(
          `${systemPrompt}\n\nAnalyze this user message and determine the intent:
        "${userMessage}"
        
        Respond with one of: BOOK_APPOINTMENT, FIND_SLOTS, GET_EVENTS, CANCEL_EVENT, or GENERAL_CHAT`,
          { temperature: 0.1 }
        );
      }

      const intent = intentText.trim().toUpperCase();
      this.logger.info(
        `Detected intent: ${intent} for message: ${userMessage}`
      );

      let reply: string;
      let actions: any[] = [];

      switch (intent) {
        case 'BOOK_APPOINTMENT':
          reply = await this.handleBookAppointment(
            userMessage,
            accessToken,
            input.metadata?.timezone
          );
          actions = [{ type: 'create_event', status: 'done' }];
          break;

        case 'FIND_SLOTS':
          reply = await this.handleFindSlots(userMessage, accessToken);
          actions = [{ type: 'find_free_slots', status: 'done' }];
          break;

        case 'GET_EVENTS':
          reply = await this.handleGetEvents(userMessage, accessToken);
          actions = [{ type: 'get_events', status: 'done' }];
          break;

        case 'CANCEL_EVENT':
          reply = await this.handleCancelEvent(userMessage, accessToken);
          actions = [{ type: 'cancel_event', status: 'done' }];
          break;

        default:
          if (this.llm.generateWithUsage) {
            const { text, usage } = await this.llm.generateWithUsage(
              `${systemPrompt}\n\nUser: ${userMessage}\n\nAssistant:`,
              { temperature: 0.7 }
            );
            reply = text;
            usageTotalTokens = usage?.totalTokens ?? usageTotalTokens;
          } else {
            reply = await this.llm.generate(
              `${systemPrompt}\n\nUser: ${userMessage}\n\nAssistant:`,
              { temperature: 0.7 }
            );
          }
          actions = [{ type: 'general_chat', status: 'done' }];
      }

      return {
        reply,
        actions,
        followups: this.generateFollowups(intent),
        ...(typeof usageTotalTokens === 'number'
          ? ({ usageTotalTokens } as any)
          : {}),
      };
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          userId: input.userId,
          sessionId: input.sessionId,
          originalMessage: input.message,
          metadata: input.metadata,
          intent: input.intent,
          entities: input.entities,
        },
        'AppointmentAgent processing error:'
      );
      return {
        reply:
          "I'm sorry, I encountered an error while processing your request. Please try again or check your Google account connection.",
        actions: [
          {
            type: 'error',
            status: 'failed',
            payload: {
              reason: 'APPOINTMENT_PROCESSING_ERROR',
              details: String((error as any)?.message || error),
            },
          },
        ],
        followups: [
          {
            type: 'question',
            text: 'Is there anything else I can help you with?',
          },
        ],
      };
    }
  }

  private async getUserAccessToken(userId: string): Promise<string | null> {
    try {
      // Get user's Google OAuth token from Supabase
      const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(
        userId
      );

      if (error || !user.user) {
        this.logger.error(error, 'Error getting user:');
        return null;
      }

      // Extract access token from Google provider identity
      const googleIdentity = user.user.identities?.find(
        identity => identity.provider === 'google'
      );

      if (!googleIdentity) {
        this.logger.info('User has no Google identity');
        return null;
      }

      // provider_token is the Google access token provided by Supabase
      const accessToken =
        (googleIdentity.identity_data as Record<string, any> | undefined)
          ?.access_token ||
        (googleIdentity.identity_data as Record<string, any> | undefined)
          ?.provider_token ||
        '';

      if (!accessToken) {
        this.logger.info('No access token found for Google identity');
        return null;
      }

      return accessToken;
    } catch (error) {
      this.logger.error(error, 'Error getting access token:');
      return null;
    }
  }

  private async handleBookAppointment(
    message: string,
    accessToken: string,
    timezone?: string
  ): Promise<string> {
    try {
      // Use LLM to extract appointment information
      const extractPrompt = `Extract appointment details from this message: "${message}"
      
      Please extract and return ONLY a valid JSON object with these fields:
      {
        "summary": "appointment title",
        "description": "appointment description",
        "naturalDateTime": "extracted date/time like 'Tuesday 5pm'",
        "duration": 30
      }
      
      If you cannot extract clear appointment details, return: {"error": "insufficient_info"}`;

      const extractionResult = await this.llm.generate(extractPrompt, {
        temperature: 0.1,
      });

      let parsed;
      try {
        // Attempt JSON extraction
        const jsonMatch = extractionResult.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found');
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        this.logger.error(parseError, 'Error parsing extraction result:');
        return "I need more specific information to book your appointment. Please provide the type of appointment and a specific date/time (e.g., 'Book a GP appointment for Tuesday at 5pm').";
      }

      if (parsed.error === 'insufficient_info') {
        return "I need more details to book your appointment. Please specify:\n- Type of appointment (GP, specialist, etc.)\n- Preferred date and time\n\nFor example: 'Book a GP appointment for Tuesday at 5pm'";
      }

      // Convert natural language date/time to Date object
      const appointmentDateTime = this.calendarService.parseNaturalDateTime(
        parsed.naturalDateTime,
        timezone || 'UTC'
      );

      if (!appointmentDateTime) {
        return "I couldn't understand the date and time you specified. Please try again with a clear date and time, like 'Tuesday at 5pm' or 'next Monday at 2pm'.";
      }

      // Check if the time slot is available
      const endTime = new Date(
        appointmentDateTime.getTime() + (parsed.duration || 30) * 60000
      );

      const events = await this.calendarService.getEvents(
        accessToken,
        appointmentDateTime.toISOString(),
        endTime.toISOString()
      );

      if (events.length > 0) {
        return `I found a conflict in your calendar at ${appointmentDateTime.toLocaleDateString()} ${appointmentDateTime.toLocaleTimeString(
          [],
          { hour: '2-digit', minute: '2-digit' }
        )}. Would you like me to suggest alternative times?`;
      }

      // Create appointment
      const event: CalendarEvent = {
        summary: parsed.summary || 'Medical Appointment',
        description: parsed.description || 'Appointment booked via MedicAgent',
        start: {
          dateTime: appointmentDateTime.toISOString(),
          timeZone: timezone || 'UTC',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: timezone || 'UTC',
        },
      };

      try {
        const result = await this.calendarService.createEvent(
          accessToken,
          event
        );

        const formattedDate = appointmentDateTime.toLocaleDateString();
        const formattedTime = appointmentDateTime.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        return `✅ **Appointment Successfully Booked!**

📅 **${event.summary}**
🗓️ ${formattedDate} at ${formattedTime}
⏱️ Duration: ${parsed.duration || 30} minutes

Your appointment has been added to your Google Calendar. You should receive a notification shortly.

Event ID: ${result.id}`;
      } catch (calendarError: any) {
        // Handle Google Calendar API errors
        if (
          calendarError?.response?.status === 401 ||
          calendarError?.response?.status === 403
        ) {
          return 'Your Google Calendar access has expired. Please reconnect your Google account to book appointments.';
        }
        throw calendarError; // Re-throw other errors
      }
    } catch (error) {
      this.logger.error(error, 'Error booking appointment:');
      return 'I encountered an error while booking your appointment. Please try again or provide more specific details about your preferred date and time.';
    }
  }

  private async handleFindSlots(
    message: string,
    accessToken: string
  ): Promise<string> {
    try {
      // Extract date range
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

      // Use tool node for calendar free slots
      const { findFreeSlotsTool } = await import('../tools/calendar');
      const result = await findFreeSlotsTool(this.logger, {
        accessToken,
        startIso: today.toISOString(),
        endIso: nextWeek.toISOString(),
        durationMinutes: 30,
      });

      if (!result.ok) {
        this.logger.error({ error: result.error }, 'findFreeSlotsTool failed');
        return 'I encountered an error while checking your calendar availability. Please try again.';
      }
      const slots = result.data;

      if (slots.length === 0) {
        return "I couldn't find any available 30-minute slots in your calendar for the next week. Would you like me to check a different time period or shorter duration?";
      }

      const slotList = slots
        .slice(0, 5)
        .map((slot, index) => {
          const start = new Date(slot.start);
          const end = new Date(slot.end);
          return `${
            index + 1
          }. ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })} - ${end.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
        })
        .join('\n');

      return `Here are some available time slots in your calendar:\n\n${slotList}\n\nWould you like me to book one of these slots? Just say something like "book slot 1" or specify your own time.`;
    } catch (error) {
      this.logger.error(error, 'Error finding slots:');
      return 'I encountered an error while checking your calendar availability. Please try again.';
    }
  }

  private async handleGetEvents(
    message: string,
    accessToken: string
  ): Promise<string> {
    try {
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

      const events = await this.calendarService.getEvents(
        accessToken,
        today.toISOString(),
        nextWeek.toISOString()
      );

      if (events.length === 0) {
        return "You don't have any upcoming appointments in your calendar for the next week.";
      }

      const eventList = events
        .map((event, index) => {
          const start = new Date(
            event.start?.dateTime || event.start?.date || ''
          );
          return `${index + 1}. **${
            event.summary || 'Untitled Event'
          }**\n   📅 ${start.toLocaleDateString()} at ${start.toLocaleTimeString(
            [],
            { hour: '2-digit', minute: '2-digit' }
          )}`;
        })
        .join('\n\n');

      return `📅 **Your Upcoming Appointments:**\n\n${eventList}`;
    } catch (error) {
      this.logger.error(error, 'Error getting events:');
      return 'I encountered an error while retrieving your calendar events. Please try again.';
    }
  }

  private async handleCancelEvent(
    message: string,
    accessToken: string
  ): Promise<string> {
    return "To cancel an appointment, please provide more details about which appointment you'd like to cancel. You can reference it by date, time, or appointment type.";
  }

  // A2A request handling - medication reminder schedule creation request from other agents
  protected async handleA2ARequest(message: any): Promise<void> {
    if (message.content?.action === 'create_medication_reminder') {
      const medicationData = message.content.data;

      // Add medication reminder to calendar
      try {
        const accessToken = message.content.accessToken;
        if (accessToken && accessToken !== 'test-token') {
          // Convert medication schedule to calendar event
          const event = this.createMedicationReminderEvent(medicationData);
          await this.calendarService.createEvent(accessToken, event);

          // Send success response
          await this.sendA2AMessage(message.from, 'response', {
            success: true,
            message: 'Medication reminder added to calendar',
            eventId: event.id,
          });
        }
      } catch (error) {
        this.logger.error('Error creating medication reminder:', error as any);
        await this.sendA2AMessage(message.from, 'response', {
          success: false,
          error: 'Failed to create medication reminder',
        });
      }
    }
  }

  // Convert medication reminder to calendar event
  private createMedicationReminderEvent(medicationData: any): any {
    // Create calendar event based on medication data
    const now = new Date();
    const reminderTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours later

    return {
      summary: `Medication Reminder: ${
        medicationData.medication || 'Medication'
      }`,
      description: `Take your medication as prescribed.\n\nDetails: ${
        medicationData.details || 'No additional details'
      }`,
      start: {
        dateTime: reminderTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: new Date(reminderTime.getTime() + 30 * 60000).toISOString(),
        timeZone: 'UTC',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 15 },
          { method: 'email', minutes: 60 },
        ],
      },
    };
  }

  private generateFollowups(
    intent: string
  ): { type: 'question' | 'confirm' | 'info'; text: string }[] {
    switch (intent) {
      case 'BOOK_APPOINTMENT':
        return [
          {
            type: 'question',
            text: 'Would you like to set a reminder for this appointment?',
          },
        ];
      case 'FIND_SLOTS':
        return [
          {
            type: 'question',
            text: 'Would you like me to book one of these available time slots?',
          },
        ];
      case 'GET_EVENTS':
        return [
          {
            type: 'question',
            text: 'Would you like to modify or cancel any of these appointments?',
          },
        ];
      default:
        return [
          {
            type: 'question',
            text: 'How else can I help you with your calendar management?',
          },
        ];
    }
  }
}
