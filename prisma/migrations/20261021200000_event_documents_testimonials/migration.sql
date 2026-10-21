-- CreateEnum
CREATE TYPE "TestimonialCategory" AS ENUM ('INSTITUTION', 'COMPANY', 'RECRUITMENT', 'PARTICIPANT', 'MENTOR', 'OTHER');

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "catalogKey" TEXT,
ADD COLUMN     "catalogName" TEXT,
ADD COLUMN     "reportKey" TEXT,
ADD COLUMN     "reportName" TEXT,
ADD COLUMN     "reportUploadedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT,
    "category" "TestimonialCategory" NOT NULL,
    "quote" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorTitle" TEXT,
    "organization" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Testimonial_published_featured_sortOrder_idx" ON "Testimonial"("published", "featured", "sortOrder");

-- CreateIndex
CREATE INDEX "Testimonial_competitionId_idx" ON "Testimonial"("competitionId");

-- AddForeignKey
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

