import { cookie } from "@elysiajs/cookie";
import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { auth3 } from "./auth2";
import { auth4 } from "./authbyme";
import { Connectdb } from "../lib/connect";
import { Profile } from "./profile/user";
import { Carts } from "./cars/cars";
import { Connectsql } from "../libsql/connect";
import swagger from "@elysiajs/swagger";
import { User } from "../libsql2/user";
const app = new Elysia();
//auth3(app)
const Startsever = async () => {
  try {
    app
      .use(
        swagger({
          documentation: {
            info: {
              title: "Elysia",
              version: "1.0.0",
            },
            tags: [
              {
                name: "Authentication",
                description: "Operations related to authentication",
              },
            ],
            paths: {
              "/auth/login": {
                post: {
                  tags: ["Authentication"],
                  summary: "Login a user",
                  requestBody: {
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            username: { type: "string" },
                            password: { type: "string" },
                          },
                          required: ["username", "password"],
                        },
                      },
                    },
                  },
                  responses: {
                    "200": {
                      description: "User logged in successfully",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: {
                              message: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                    "401": {
                      description: "Invalid credentials",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: {
                              message: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              "/auth/register": {
                post: {
                  tags: ["Authentication"],
                  requestBody: {
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            username: { type: "string" },
                            password: { type: "string" },
                            email: { type: "string" },
                          },
                          required: ["username", "password", "email"],
                        },
                      },
                    },
                  },
                  responses: {
                    200: {
                      description: "User Registered Successfully",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: {
                              message: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                    400: {
                      description: "User Already Exists",
                      content: {
                        "application/json": {
                          schema: {
                            type: "object",
                            properties: {
                              message: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        })
      )

      .use(
        jwt({
          name: "jwt",
          secret: process.env.JWT_SECRET!,
        })
      )

      .use(cors())
      //.use(auth3)
      .use(User)
      .use(auth4)
      .use(Profile)
      .use(Carts)

      .get("/", () => "Hello Elysia")
      .listen(4000, () => {
        console.log(
          `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
        );
      });
  } catch (err) {
    console.log(err);
  }
  await Connectdb();
  await Connectsql();
};

Startsever();
