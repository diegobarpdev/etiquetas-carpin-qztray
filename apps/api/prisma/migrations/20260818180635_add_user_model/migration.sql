-- CreateEnum
CREATE TYPE "Role" AS ENUM ('operario', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "inspectors" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'operario',
    "status" "UserStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
