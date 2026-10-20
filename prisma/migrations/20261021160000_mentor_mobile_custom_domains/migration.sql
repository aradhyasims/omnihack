-- AlterTable
ALTER TABLE "MentorApplication" ADD COLUMN     "mobile" TEXT;

-- CreateTable
CREATE TABLE "MentorDomain" (
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentorDomain_pkey" PRIMARY KEY ("value")
);
