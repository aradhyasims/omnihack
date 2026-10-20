// Centralized brand and organization-specific settings.
// Change these values (not component code) to rebrand or update contact details.
export const brand = {
  name: "OmniHack",
  tagline: "Run ideathons and hackathons end to end",
  description: "OmniHack is a platform for discovering, organizing, judging and certifying ideathons, hackathons and innovation challenges.",
  contact: {
    // Placeholder addresses: replace before production launch.
    generalEmail: "hello@omnihack.example",
    supportEmail: "support@omnihack.example",
    privacyEmail: "privacy@omnihack.example",
  },
  legal: {
    entityName: "OmniHack",
    privacyPath: "/privacy",
    termsPath: "/terms",
  },
  // Leave empty until official accounts exist; empty entries are not rendered.
  social: {
    linkedin: "",
    x: "",
    github: "",
    instagram: "",
  } as Record<string, string>,
  colors: {
    primary: "#4F46E5",
    accent: "#06B6D4",
    ink: "#0B1020",
  },
} as const;

export type Brand = typeof brand;
