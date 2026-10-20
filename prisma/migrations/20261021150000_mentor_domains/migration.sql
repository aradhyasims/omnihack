-- AlterTable
ALTER TABLE "MentorApplication" ADD COLUMN     "domains" TEXT[] DEFAULT ARRAY[]::TEXT[];
