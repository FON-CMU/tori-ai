-- AlterTable
ALTER TABLE "JaRecord" ALTER COLUMN "startAt" DROP NOT NULL,
ALTER COLUMN "endAt" DROP NOT NULL,
ALTER COLUMN "totalHours" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "entraOid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_entraOid_key" ON "User"("entraOid");

