-- CreateEnum
CREATE TYPE "HostingFeeStatus" AS ENUM ('UNPAID', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'WAIVED');

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "hostingFeeAmountMinor" INTEGER NOT NULL DEFAULT 1000000,
ADD COLUMN     "hostingFeeStatus" "HostingFeeStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "payeeAccountName" TEXT,
ADD COLUMN     "payeeAccountNumber" TEXT,
ADD COLUMN     "payeeBankName" TEXT,
ADD COLUMN     "payeeBranch" TEXT,
ADD COLUMN     "payeeIfsc" TEXT,
ADD COLUMN     "payeeUpiId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "paidOn" TIMESTAMP(3),
ADD COLUMN     "payerName" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateTable
CREATE TABLE "HostingFeePayment" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "utr" TEXT NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "payerName" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostingFeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentorInvite" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "mentorApplicationId" TEXT NOT NULL,
    "role" "CompetitionRole" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HostingFeePayment_utr_key" ON "HostingFeePayment"("utr");

-- CreateIndex
CREATE INDEX "HostingFeePayment_status_createdAt_idx" ON "HostingFeePayment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "HostingFeePayment_competitionId_idx" ON "HostingFeePayment"("competitionId");

-- CreateIndex
CREATE INDEX "MentorInvite_mentorApplicationId_status_idx" ON "MentorInvite"("mentorApplicationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MentorInvite_competitionId_mentorApplicationId_role_key" ON "MentorInvite"("competitionId", "mentorApplicationId", "role");

-- CreateIndex
CREATE INDEX "Payment_registrationId_idx" ON "Payment"("registrationId");

-- AddForeignKey
ALTER TABLE "HostingFeePayment" ADD CONSTRAINT "HostingFeePayment_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorInvite" ADD CONSTRAINT "MentorInvite_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorInvite" ADD CONSTRAINT "MentorInvite_mentorApplicationId_fkey" FOREIGN KEY ("mentorApplicationId") REFERENCES "MentorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

