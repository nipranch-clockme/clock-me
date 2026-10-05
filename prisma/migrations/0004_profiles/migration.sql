-- AlterTable
ALTER TABLE "User" ADD COLUMN     "employeeId" TEXT,
ADD COLUMN     "joiningDate" DATE,
ADD COLUMN     "photoAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProfilePhoto" (
    "userId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfilePhoto_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- AddForeignKey
ALTER TABLE "ProfilePhoto" ADD CONSTRAINT "ProfilePhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

