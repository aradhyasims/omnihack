-- CreateTable
CREATE TABLE "MentorApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "linkedinUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MentorApplication_status_createdAt_idx" ON "MentorApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MentorApplication_linkedinUrl_idx" ON "MentorApplication"("linkedinUrl");
