-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "bannerImageKey" TEXT,
ADD COLUMN     "logoImageKey" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "logoImageKey" TEXT;
