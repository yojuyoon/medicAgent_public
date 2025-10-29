import type { FastifyInstance } from 'fastify';
import { supabaseAdmin, supabaseAnon } from '../lib/supabase';
import { z } from 'zod';

const signUpSchema = z.object({
  email: z
    .string()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email format'),
  password: z.string().min(8),
  userData: z
    .object({
      first_name: z.string(),
      last_name: z.string(),
      full_name: z.string(),
    })
    .optional(),
});

const signInSchema = z.object({
  email: z
    .string()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email format'),
  password: z.string(),
});

const getUserSchema = z.object({
  userId: z.string(),
});

export default async function authRoutes(fastify: FastifyInstance) {
  // Sign up endpoint (email/password via anon client)
  fastify.post('/signup', async (request, reply) => {
    try {
      const { email, password, userData } = signUpSchema.parse(request.body);

      const { data, error } = await supabaseAnon.auth.signUp({
        email,
        password,
        ...(userData && { options: { data: userData } }),
      });

      if (error) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.send({ user: data.user, session: data.session });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid input data' });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Sign in endpoint (email/password via anon client)
  fastify.post('/signin', async (request, reply) => {
    try {
      const { email, password } = signInSchema.parse(request.body);

      const { data, error } = await supabaseAnon.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return reply.status(401).send({ error: error.message });
      }

      return reply.send({ user: data.user, session: data.session });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid input data' });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get user by ID
  fastify.get('/user/:userId', async (request, reply) => {
    try {
      const { userId } = getUserSchema.parse(request.params);

      const { data, error } = await supabaseAdmin.auth.admin.getUserById(
        userId
      );

      if (error) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ user: data.user });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid user ID' });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // List all users (admin only)
  fastify.get('/users', async (request, reply) => {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers();

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      return reply.send({ users: data.users });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Delete user
  fastify.delete('/user/:userId', async (request, reply) => {
    try {
      const { userId } = getUserSchema.parse(request.params);

      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

      if (error) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.send({ message: 'User deleted successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid user ID' });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Update user
  fastify.put('/user/:userId', async (request, reply) => {
    try {
      const { userId } = getUserSchema.parse(request.params);
      const updateData = request.body as any;

      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        updateData
      );

      if (error) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.send({
        user: data.user,
        message: 'User updated successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid user ID' });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
