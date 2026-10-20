// OpenAPI 3.1 description of the public REST API (v1). Keep in sync with src/app/api/v1.
// Browser UI flows use Server Actions that call the same service layer.
const err = { $ref: "#/components/responses/Error" };
const auth = [{ session: [] }];

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "OmniHack API",
    version: "1.0.0",
    description:
      "REST API for OmniHack. Responses use `{ data, meta? }`; errors use `{ error: { code, message, details? }, requestId }`. Authentication uses the HTTP-only session cookie; state-changing requests must be same-origin. Rate limits apply per IP and route (HTTP 429).",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: { session: { type: "apiKey", in: "cookie", name: "oh_session" } },
    responses: {
      Error: {
        description: "Error",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                error: {
                  type: "object",
                  properties: {
                    code: {
                      type: "string",
                      enum: ["VALIDATION", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "RATE_LIMITED", "PRECONDITION", "UNAVAILABLE", "INTERNAL"],
                    },
                    message: { type: "string" },
                    details: { type: "object" },
                  },
                },
                requestId: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
  tags: [
    { name: "System" },
    { name: "Competitions" },
    { name: "Registrations" },
    { name: "Me" },
    { name: "Submissions" },
    { name: "Judging" },
    { name: "Results" },
    { name: "Certificates" },
    { name: "Organizer" },
    { name: "Payments" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check (database connectivity)",
        responses: { "200": { description: "Healthy" }, "503": { description: "Database unreachable" } },
      },
    },
    "/v1/competitions": {
      get: {
        tags: ["Competitions"],
        summary: "Search public competitions",
        parameters: ["q", "type", "mode", "phase", "category", "eligibility", "participation", "fee", "deadline", "organizer", "page"].map((name) => ({
          name,
          in: "query",
          required: false,
          schema: { type: "string" },
        })),
        responses: { "200": { description: "Paginated list; meta has page, pageCount, total" }, "429": err },
      },
    },
    "/v1/competitions/{slug}": {
      get: {
        tags: ["Competitions"],
        summary: "Competition details (public, or preview for staff)",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Competition" }, "404": err },
      },
    },
    "/v1/competitions/{slug}/registrations": {
      post: {
        tags: ["Registrations"],
        summary: "Register the signed-in user",
        security: auth,
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["participantType", "acceptRules"],
                properties: {
                  participantType: { type: "string", enum: ["STUDENT", "PROFESSIONAL", "STARTUP", "OTHER"] },
                  institution: { type: "string" },
                  country: { type: "string" },
                  age: { type: "integer" },
                  acceptRules: { type: "boolean", const: true },
                  mediaConsent: { type: "boolean" },
                },
                additionalProperties: { type: "string", description: "cf_<key> answers to custom questions" },
              },
            },
          },
        },
        responses: { "201": { description: "Registered" }, "400": err, "401": err, "409": err, "422": err, "503": err },
      },
    },
    "/v1/competitions/{slug}/results": {
      get: {
        tags: ["Results"],
        summary: "Published results (winners & finalists; no scores)",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Results" }, "404": err },
      },
    },
    "/v1/me": { get: { tags: ["Me"], summary: "Current user", security: auth, responses: { "200": { description: "User" }, "401": err } } },
    "/v1/me/registrations": { get: { tags: ["Me"], summary: "My registrations", security: auth, responses: { "200": { description: "List" }, "401": err } } },
    "/v1/me/notifications": {
      get: {
        tags: ["Me"],
        summary: "My notifications",
        security: auth,
        parameters: [{ name: "unread", in: "query", schema: { type: "string", enum: ["1"] } }],
        responses: { "200": { description: "List" }, "401": err },
      },
      post: {
        tags: ["Me"],
        summary: "Mark notifications read (idempotent)",
        security: auth,
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } } } } } },
        responses: { "200": { description: "Updated" }, "401": err },
      },
    },
    "/v1/me/export": {
      get: { tags: ["Me"], summary: "Download my personal data (JSON)", security: auth, responses: { "200": { description: "JSON file" }, "401": err } },
    },
    "/v1/projects/{id}/submissions": {
      get: {
        tags: ["Submissions"],
        summary: "Project submissions (members, assigned judges/mentors, authorized staff)",
        security: auth,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Submissions with short-lived signed file URLs" }, "401": err, "403": err },
      },
    },
    "/v1/files/{id}": {
      get: {
        tags: ["Submissions"],
        summary: "Download a private file (requires signature + authorized session)",
        security: auth,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "exp", in: "query", required: true, schema: { type: "integer" } },
          { name: "sig", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "File (attachment)" },
          "401": { description: "Sign in required" },
          "403": { description: "Expired link or forbidden" },
        },
      },
    },
    "/v1/judging/assignments": {
      get: { tags: ["Judging"], summary: "My judging assignments", security: auth, responses: { "200": { description: "List" }, "401": err } },
    },
    "/v1/certificates/{code}/verify": {
      get: {
        tags: ["Certificates"],
        summary: "Public certificate verification (minimal data)",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Verification result" }, "404": err, "429": err },
      },
    },
    "/v1/certificates/{code}/pdf": {
      get: {
        tags: ["Certificates"],
        summary: "Download certificate PDF (recipient or authorized organizer)",
        security: auth,
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "PDF" }, "401": { description: "Sign in required" }, "403": { description: "Forbidden" } },
      },
    },
    "/v1/organizer/competitions/{id}/export/{kind}": {
      get: {
        tags: ["Organizer"],
        summary: "CSV export (registrations, teams, submissions, rankings, attendance)",
        security: auth,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "kind", in: "path", required: true, schema: { type: "string", enum: ["registrations", "teams", "submissions", "rankings", "attendance"] } },
        ],
        responses: { "200": { description: "CSV" }, "401": err, "403": err },
      },
    },
    "/v1/payments/webhook": { post: { tags: ["Payments"], summary: "Payment provider webhook (disabled until configured)", responses: { "503": err } } },
  },
} as const;
