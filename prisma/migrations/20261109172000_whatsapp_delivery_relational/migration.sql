-- CreateEnum
CREATE TYPE "WhatsAppDeliveryStatus" AS ENUM ('NOT_SENT', 'PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WhatsAppAttemptStatus" AS ENUM ('SUCCESS', 'FAILED', 'TIMEOUT_UNKNOWN');

-- CreateEnum
CREATE TYPE "ReconciliationAction" AS ENUM ('CONFIRMED_DELIVERED', 'CONFIRMED_UNDELIVERED_RETRY', 'ADMIN_CANCELLED');

-- AlterTable (Legacy fields for backward compatibility)
ALTER TABLE "Participant" ADD COLUMN "wa_delivery_status" "WhatsAppDeliveryStatus" NOT NULL DEFAULT 'NOT_SENT',
ADD COLUMN "wa_error_code" TEXT,
ADD COLUMN "wa_error_message" TEXT,
ADD COLUMN "wa_last_retry_at" TIMESTAMP(3),
ADD COLUMN "wa_message_id" TEXT,
ADD COLUMN "wa_retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "wa_sent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WhatsAppDelivery" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT,
    "participant_name" TEXT NOT NULL,
    "qr_token_snapshot" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "status" "WhatsAppDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "total_attempts" INTEGER NOT NULL DEFAULT 0,
    "processing_started_at" TIMESTAMP(3),
    "pending_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "unknown_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error_message" TEXT,

    CONSTRAINT "WhatsAppDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "status" "WhatsAppAttemptStatus" NOT NULL,
    "meta_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "request_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppReconciliationLog" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT,
    "admin_id" TEXT,
    "participant_name" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "admin_username" TEXT NOT NULL,
    "action" "ReconciliationAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "previous_status" "WhatsAppDeliveryStatus" NOT NULL,
    "resulting_status" "WhatsAppDeliveryStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppReconciliationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppDelivery_participant_id_key" ON "WhatsAppDelivery"("participant_id");

-- CreateIndex
CREATE INDEX "WhatsAppDelivery_status_idx" ON "WhatsAppDelivery"("status");

-- CreateIndex
CREATE INDEX "WhatsAppDelivery_recipient_phone_idx" ON "WhatsAppDelivery"("recipient_phone");

-- CreateIndex
CREATE INDEX "WhatsAppDelivery_qr_token_snapshot_idx" ON "WhatsAppDelivery"("qr_token_snapshot");

-- CreateIndex
CREATE INDEX "WhatsAppDelivery_processing_started_at_idx" ON "WhatsAppDelivery"("processing_started_at");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppDeliveryAttempt_meta_message_id_key" ON "WhatsAppDeliveryAttempt"("meta_message_id");

-- CreateIndex
CREATE INDEX "WhatsAppDeliveryAttempt_delivery_id_idx" ON "WhatsAppDeliveryAttempt"("delivery_id");

-- CreateIndex
CREATE INDEX "WhatsAppDeliveryAttempt_meta_message_id_idx" ON "WhatsAppDeliveryAttempt"("meta_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppDeliveryAttempt_delivery_id_attempt_number_key" ON "WhatsAppDeliveryAttempt"("delivery_id", "attempt_number");

-- CreateIndex
CREATE INDEX "WhatsAppReconciliationLog_delivery_id_idx" ON "WhatsAppReconciliationLog"("delivery_id");

-- CreateIndex
CREATE INDEX "WhatsAppReconciliationLog_admin_id_idx" ON "WhatsAppReconciliationLog"("admin_id");

-- CreateIndex
CREATE INDEX "WhatsAppReconciliationLog_created_at_idx" ON "WhatsAppReconciliationLog"("created_at");

-- AddForeignKey
ALTER TABLE "WhatsAppDelivery" ADD CONSTRAINT "WhatsAppDelivery_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppDeliveryAttempt" ADD CONSTRAINT "WhatsAppDeliveryAttempt_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "WhatsAppDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReconciliationLog" ADD CONSTRAINT "WhatsAppReconciliationLog_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "WhatsAppDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppReconciliationLog" ADD CONSTRAINT "WhatsAppReconciliationLog_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

