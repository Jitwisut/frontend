import { Elysia, t } from "elysia";
import { cookie } from "@elysiajs/cookie";

import { Lucia } from "@elysiajs/lucia-auth";
import prismaAdapter from "@lucia-auth/adapter-prisma";

import { PrismaClient } from "@prisma/client";

import redis from "@lucia-auth/adapter-session-redis";
import { createClient } from "redis";

const prisma = new PrismaClient();

const userSessionClient = createClient();
const sessionClient = createClient();

await userSessionClient.connect();
await sessionClient.connect();

const lucia = Lucia({
  adapter: {
    user: prismaAdapter(prisma as any),
    session: redis({
      session: sessionClient,
      userSession: userSessionClient,
    }),
  },
});

export const auth = (app: Elysia) =>
  app.group("/auth", (app) =>
    app
      .use(cookie())
      .model(
        "auth",
        t.Object({
          username: t.String(),
          password: t.String({
            minLength: 8,
          }),
        })
      )
      .put(
        "/sign-up",
        async ({ body: { username, password } }) =>
          lucia.createUser({
            primaryKey: {
              providerId: "username",
              providerUserId: username,
              password,
            },
            attributes: {
              username,
            },
          }),
        {
          body: "auth",
        }
      )
      .post(
        "/sign-in",
        async ({ set, setCookie, body: { username, password } }) => {
          try {
            const { userId } = await lucia.useKey(
              "username",
              username,
              password
            );

            const { sessionId } = await lucia.createSession(userId);
            setCookie("session", sessionId);

            return `Sign in as ${username}`;
          } catch {
            set.status = 401;

            return "Invalid username or password";
          }
        },
        {
          body: "auth",
        }
      )
      .onBeforeHandle(lucia.sessionGuard)
      .get("/refresh", async ({ cookie: { session }, setCookie }) => {
        const { sessionId: id } = await lucia.renewSession(session);

        setCookie("session", id);

        return session;
      })
      .get("/sign-out", async ({ cookie: { session }, removeCookie }) => {
        await lucia.invalidateSession(session);

        removeCookie("session");

        return session;
      })
      .derive(async ({ cookie: { session } }) => {
        const { userId } = await lucia.getSession(session);

        return {
          userId,
        };
      })
      .get("/profile", async ({ userId }) =>
        prisma.authUser.findUnique({
          where: {
            id: userId,
          },
        })
      )
      .delete("/user", async ({ userId, cookie: { session } }) => {
        await lucia.deleteDeadUserSessions(session);
        await lucia.deleteUser(userId);
    
        return userId;
      })
  );

export default auth;
