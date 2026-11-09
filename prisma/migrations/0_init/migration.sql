-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."ChurchStatus" AS ENUM ('BERGEREJA', 'TIDAK_BERGEREJA');

-- CreateEnum
CREATE TYPE "public"."RegistrationStatus" AS ENUM ('REGISTERED', 'CHECKED_IN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."RegistrationType" AS ENUM ('ONLINE', 'ON_SITE');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('MASTER', 'ADMIN');

-- CreateTable
CREATE TABLE "public"."Participant" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "whatsapp_number" TEXT NOT NULL,
    "is_child" BOOLEAN NOT NULL DEFAULT false,
    "is_wa_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "qr_token" TEXT NOT NULL,
    "status" "public"."RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "registration_type" "public"."RegistrationType" NOT NULL DEFAULT 'ONLINE',
    "checked_in_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "church_branch" TEXT,
    "church_status" "public"."ChurchStatus" NOT NULL DEFAULT 'BERGEREJA',

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Participant_full_name_whatsapp_number_idx" ON "public"."Participant"("full_name" ASC, "whatsapp_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Participant_qr_token_key" ON "public"."Participant"("qr_token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username" ASC);

