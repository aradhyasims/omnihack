// Built-in mentoring domains: mentors pick 1–3 on registration, and the Mentorship page filters by them.
// "Other" lets a mentor type their own; those are stored in the MentorDomain table and join this list once in use.
// Values are stored in the database and used in URLs (?domain=…) — add new entries freely, but don't rename values.
export const MENTOR_DOMAINS = [
  { value: "ai-ml", label: "AI & Machine Learning" },
  { value: "data-science", label: "Data Science & Analytics" },
  { value: "web-dev", label: "Web Development" },
  { value: "mobile-dev", label: "Mobile Development" },
  { value: "cloud-devops", label: "Cloud & DevOps" },
  { value: "cybersecurity", label: "Cybersecurity" },
  { value: "blockchain", label: "Blockchain & Web3" },
  { value: "iot-hardware", label: "IoT & Hardware" },
  { value: "ui-ux", label: "UI/UX Design" },
  { value: "product", label: "Product Management" },
  { value: "startups", label: "Entrepreneurship & Startups" },
  { value: "fintech", label: "FinTech" },
  { value: "healthtech", label: "HealthTech" },
  { value: "sustainability", label: "Sustainability & CleanTech" },
  { value: "other", label: "Other" },
] as const;

export type DomainOption = { value: string; label: string };

export const OTHER_DOMAIN = "other";

/** Built-in domains a mentor can actually be listed under (everything except the "Other" placeholder). */
export const BUILTIN_MENTOR_DOMAINS: DomainOption[] = MENTOR_DOMAINS.filter((d) => d.value !== OTHER_DOMAIN);

export const slugifyDomain = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
