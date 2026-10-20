-- CreateEnum
CREATE TYPE "OpeningType" AS ENUM ('INTERNSHIP', 'FULL_TIME', 'PRE_PLACEMENT_OFFER', 'CONTRACT');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ONSITE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SHORTLISTED', 'INTERVIEW_INVITED', 'INTERVIEW_ACCEPTED', 'OFFERED', 'OFFER_ACCEPTED', 'OFFER_DECLINED', 'NOT_SELECTED', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "CompetitionRole" ADD VALUE 'RECRUITER';

-- AlterEnum
ALTER TYPE "InquiryTopic" ADD VALUE 'HIRING';

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "hiringEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hiringNote" TEXT,
ADD COLUMN     "showRankBandToRecruiters" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "CompetitionMember" ADD COLUMN     "company" TEXT;

-- CreateTable
CREATE TABLE "JobOpening" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "OpeningType" NOT NULL,
    "workMode" "WorkMode" NOT NULL DEFAULT 'ONSITE',
    "locations" TEXT[],
    "skills" TEXT[],
    "description" TEXT NOT NULL DEFAULT '',
    "compensation" TEXT,
    "durationText" TEXT,
    "positions" INTEGER NOT NULL DEFAULT 1,
    "closesAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentConsent" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleInterests" TEXT[],
    "preferredLocations" TEXT[],
    "availableFrom" TIMESTAMP(3),
    "graduationYear" INTEGER,
    "sharePortfolio" BOOLEAN NOT NULL DEFAULT true,
    "adultConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "resumeKey" TEXT,
    "resumeName" TEXT,
    "resumeScanStatus" "ScanStatus" NOT NULL DEFAULT 'NOT_SCANNED',
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateApplication" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "openingId" TEXT,
    "openingKey" TEXT NOT NULL DEFAULT 'general',
    "company" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SHORTLISTED',
    "interviewAt" TIMESTAMP(3),
    "interviewDetails" TEXT,
    "offerType" "OpeningType",
    "offerDetails" TEXT,
    "recruiterNote" TEXT NOT NULL DEFAULT '',
    "candidateNote" TEXT,
    "firstResponseAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobOpening_competitionId_active_idx" ON "JobOpening"("competitionId", "active");

-- CreateIndex
CREATE INDEX "TalentConsent_competitionId_withdrawnAt_idx" ON "TalentConsent"("competitionId", "withdrawnAt");

-- CreateIndex
CREATE UNIQUE INDEX "TalentConsent_competitionId_userId_key" ON "TalentConsent"("competitionId", "userId");

-- CreateIndex
CREATE INDEX "CandidateApplication_competitionId_status_idx" ON "CandidateApplication"("competitionId", "status");

-- CreateIndex
CREATE INDEX "CandidateApplication_candidateId_idx" ON "CandidateApplication"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateApplication_competitionId_candidateId_openingKey_key" ON "CandidateApplication"("competitionId", "candidateId", "openingKey");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_idx" ON "ApplicationEvent"("applicationId");

-- AddForeignKey
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentConsent" ADD CONSTRAINT "TalentConsent_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentConsent" ADD CONSTRAINT "TalentConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateApplication" ADD CONSTRAINT "CandidateApplication_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateApplication" ADD CONSTRAINT "CandidateApplication_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateApplication" ADD CONSTRAINT "CandidateApplication_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "JobOpening"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CandidateApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
