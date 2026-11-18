-- CreateEnum
CREATE TYPE "WebhookBatchStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'PARTIALLY_FAILED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookEventProcessingState" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'UNMATCHED', 'IGNORED', 'FAILED', 'RETRY');

-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('STATUS_UPDATE', 'INBOUND_MESSAGE', 'UNSUPPORTED');

-- CreateTable
CREATE TABLE "WhatsAppWebhookBatch" (
    "id" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "status" "WebhookBatchStatus" NOT NULL DEFAULT 'RECEIVED',
    "events_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "WhatsAppWebhookBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppWebhookEvent" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT,
    "attempt_id" TEXT,
    "event_identity" TEXT NOT NULL,
    "event_type" "WebhookEventType" NOT NULL,
    "meta_message_id" TEXT,
    "event_status" TEXT,
    "meta_timestamp" TIMESTAMP(3),
    "recipient_phone" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "raw_event" JSONB,
    "processing_state" "WebhookEventProcessingState" NOT NULL DEFAULT 'RECEIVED',
    "claim_token" TEXT,
    "claimed_at" TIMESTAMP(3),
    "claim_expires_at" TIMESTAMP(3),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppWebhookBatch_payload_hash_key" ON "WhatsAppWebhookBatch"("payload_hash");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookBatch_created_at_idx" ON "WhatsAppWebhookBatch"("created_at");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookBatch_status_idx" ON "WhatsAppWebhookBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppWebhookEvent_event_identity_key" ON "WhatsAppWebhookEvent"("event_identity");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_attempt_id_idx" ON "WhatsAppWebhookEvent"("attempt_id");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_processing_state_next_retry_at_idx" ON "WhatsAppWebhookEvent"("processing_state", "next_retry_at");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_meta_message_id_idx" ON "WhatsAppWebhookEvent"("meta_message_id");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_claim_expires_at_idx" ON "WhatsAppWebhookEvent"("claim_expires_at");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_batch_id_idx" ON "WhatsAppWebhookEvent"("batch_id");

-- AddForeignKey
ALTER TABLE "WhatsAppWebhookEvent" ADD CONSTRAINT "WhatsAppWebhookEvent_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "WhatsAppWebhookBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppWebhookEvent" ADD CONSTRAINT "WhatsAppWebhookEvent_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "WhatsAppDeliveryAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

