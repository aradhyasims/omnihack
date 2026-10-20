// Default stage sequences per competition type. These are starting points only: organizers can
// add, edit, reorder, enable and disable stages afterwards (the engine never hardcodes a sequence).
import type { AdvancementRule, CompetitionType, StageType, SubmissionTemplate } from "@prisma/client";

export type CriterionSeed = { name: string; description: string; weight: number; minScore?: number; maxScore?: number; tieBreakPriority?: number };

export type StageSeed = {
  name: string;
  type: StageType;
  description: string;
  enabled?: boolean;
  acceptsSubmissions?: boolean;
  submissionTemplate?: SubmissionTemplate;
  isJudged?: boolean;
  onlyAdvancedProjects?: boolean;
  advancementRule?: AdvancementRule;
  advancementValue?: number;
  criteria?: CriterionSeed[];
};

export const STAGE_TYPE_LABELS: Record<StageType, string> = {
  REGISTRATION: "Registration",
  ELIGIBILITY_SCREENING: "Eligibility screening",
  IDEA_SUBMISSION: "Idea submission",
  ABSTRACT_EVALUATION: "Abstract evaluation",
  PITCH_PRESENTATION: "Pitch presentation",
  PROTOTYPE_DEVELOPMENT: "Prototype development",
  PROGRESS_CHECKPOINT: "Progress checkpoint",
  FINAL_SUBMISSION: "Final project submission",
  TECHNICAL_REVIEW: "Technical review",
  DEMONSTRATION: "Demonstration",
  FINAL_PRESENTATION: "Final presentation",
  RESULTS: "Results",
  CERTIFICATE_ISSUANCE: "Certificate issuance",
};

const IDEA_RUBRIC: CriterionSeed[] = [
  { name: "Problem understanding", description: "Clarity and evidence of the problem and who it affects.", weight: 20, tieBreakPriority: 3 },
  { name: "Innovation", description: "Originality and differentiation from existing solutions.", weight: 25, tieBreakPriority: 1 },
  { name: "Feasibility", description: "Realistic plan, resources and constraints.", weight: 20 },
  { name: "Potential impact", description: "Scale and depth of benefit for the target users.", weight: 25, tieBreakPriority: 2 },
  { name: "Presentation", description: "Clarity and completeness of the submission.", weight: 10 },
];

const PITCH_RUBRIC: CriterionSeed[] = [
  { name: "Clarity of pitch", description: "Communicates the problem, solution and value clearly.", weight: 30, tieBreakPriority: 2 },
  { name: "Solution quality", description: "Strength and soundness of the proposed solution.", weight: 40, tieBreakPriority: 1 },
  { name: "Q&A responses", description: "Understanding demonstrated when answering questions.", weight: 30 },
];

const TECH_RUBRIC: CriterionSeed[] = [
  { name: "Technical execution", description: "Quality, robustness and completeness of the implementation.", weight: 30, tieBreakPriority: 1 },
  { name: "Innovation", description: "Novel approach or creative use of technology.", weight: 20, tieBreakPriority: 2 },
  { name: "Impact & usefulness", description: "How well the project solves the stated challenge.", weight: 25, tieBreakPriority: 3 },
  { name: "Design & usability", description: "User experience and accessibility.", weight: 15 },
  { name: "Documentation", description: "README, architecture and deployment notes.", weight: 10 },
];

const DEMO_RUBRIC: CriterionSeed[] = [
  { name: "Working demonstration", description: "The prototype works as described during the live demo.", weight: 40, tieBreakPriority: 1 },
  { name: "Presentation", description: "Clear story, problem, solution and next steps.", weight: 30, tieBreakPriority: 2 },
  { name: "Viability", description: "Potential to be adopted, deployed or continued.", weight: 30 },
];

const RESULTS: StageSeed = { name: "Results & winner announcement", type: "RESULTS", description: "Results are approved by the organizer and published." };
const CERTS: StageSeed = {
  name: "Certificates & showcase",
  type: "CERTIFICATE_ISSUANCE",
  description: "Verifiable certificates are issued and approved projects can be showcased.",
};

export const STAGE_TEMPLATES: Record<CompetitionType, StageSeed[]> = {
  IDEATHON: [
    { name: "Registration", type: "REGISTRATION", description: "Participants register and confirm eligibility." },
    { name: "Eligibility screening", type: "ELIGIBILITY_SCREENING", description: "Organizers review registrations against eligibility rules.", enabled: false },
    {
      name: "Idea submission & preliminary evaluation",
      type: "IDEA_SUBMISSION",
      description: "Submit your idea using the structured template. Judges score every eligible idea.",
      acceptsSubmissions: true,
      submissionTemplate: "IDEA",
      isJudged: true,
      advancementRule: "TOP_N",
      advancementValue: 10,
      criteria: IDEA_RUBRIC,
    },
    {
      name: "Pitch round",
      type: "PITCH_PRESENTATION",
      description: "Shortlisted ideas pitch to the jury. Finalists are selected from this round.",
      isJudged: true,
      onlyAdvancedProjects: true,
      advancementRule: "TOP_N",
      advancementValue: 5,
      criteria: PITCH_RUBRIC,
    },
    {
      name: "Final presentation",
      type: "FINAL_PRESENTATION",
      description: "Finalists present to the final jury.",
      isJudged: true,
      onlyAdvancedProjects: true,
      advancementRule: "MANUAL",
      criteria: PITCH_RUBRIC,
    },
    RESULTS,
    CERTS,
  ],
  HACKATHON: [
    { name: "Registration & team formation", type: "REGISTRATION", description: "Register, form a team and choose a challenge." },
    { name: "Development sprint", type: "PROTOTYPE_DEVELOPMENT", description: "Build your project. Mentors are available during the sprint." },
    {
      name: "Progress checkpoint",
      type: "PROGRESS_CHECKPOINT",
      description: "Optional mid-sprint check-in with a short progress update.",
      enabled: false,
      acceptsSubmissions: true,
      submissionTemplate: "PROJECT",
    },
    {
      name: "Final submission & technical judging",
      type: "FINAL_SUBMISSION",
      description: "Submit repository, demo and documentation. Judges perform a technical review.",
      acceptsSubmissions: true,
      submissionTemplate: "PROJECT",
      isJudged: true,
      advancementRule: "TOP_N",
      advancementValue: 6,
      criteria: TECH_RUBRIC,
    },
    {
      name: "Live demonstrations & final presentations",
      type: "DEMONSTRATION",
      description: "Finalists demo their working prototypes to the jury.",
      isJudged: true,
      onlyAdvancedProjects: true,
      advancementRule: "MANUAL",
      criteria: DEMO_RUBRIC,
    },
    RESULTS,
    CERTS,
  ],
  HYBRID: [
    { name: "Registration", type: "REGISTRATION", description: "Register individually or as a team." },
    {
      name: "Idea submission & evaluation",
      type: "IDEA_SUBMISSION",
      description: "Submit your idea. The best ideas advance to the build phase.",
      acceptsSubmissions: true,
      submissionTemplate: "IDEA",
      isJudged: true,
      advancementRule: "TOP_N",
      advancementValue: 10,
      criteria: IDEA_RUBRIC,
    },
    {
      name: "Prototype development",
      type: "PROTOTYPE_DEVELOPMENT",
      description: "Shortlisted teams build a working prototype of their idea.",
      onlyAdvancedProjects: true,
    },
    {
      name: "Prototype submission & technical review",
      type: "FINAL_SUBMISSION",
      description: "Submit the prototype with repository, demo and documentation.",
      acceptsSubmissions: true,
      submissionTemplate: "PROJECT",
      isJudged: true,
      onlyAdvancedProjects: true,
      advancementRule: "TOP_N",
      advancementValue: 5,
      criteria: TECH_RUBRIC,
    },
    {
      name: "Final demonstration",
      type: "DEMONSTRATION",
      description: "Finalists demonstrate their prototypes.",
      isJudged: true,
      onlyAdvancedProjects: true,
      advancementRule: "MANUAL",
      criteria: DEMO_RUBRIC,
    },
    RESULTS,
    CERTS,
  ],
};
