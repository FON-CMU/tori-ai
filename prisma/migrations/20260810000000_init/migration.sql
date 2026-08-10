-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('EMPLOYEE', 'SUPERVISOR', 'HR', 'ADMIN');

-- CreateEnum
CREATE TYPE "TorStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'REVIEW_REQUIRED', 'ACTIVE', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('DIRECT', 'OCR');

-- CreateEnum
CREATE TYPE "TorCategory" AS ENUM ('ROUTINE', 'ASSIGNED', 'DEVELOPMENT');

-- CreateEnum
CREATE TYPE "TorTopicKind" AS ENUM ('SECTION', 'TOPIC', 'SUBITEM');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WorkDraftStatus" AS ENUM ('COLLECTING', 'READY_FOR_REVIEW', 'SAVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JaStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AiPurpose" AS ENUM ('TOR_EXTRACTION', 'WORK_EXTRACTION', 'CLASSIFICATION', 'DRAFTING');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'REFUSED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "AiProviderPreference" AS ENUM ('OPENAI', 'GOOGLE_AI_STUDIO');

-- CreateTable
CREATE TABLE "Unit" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "cmuAccount" TEXT NOT NULL,
    "entraOid" TEXT,
    "employeeId" TEXT NOT NULL,
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "position" TEXT,
    "unitId" UUID NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemAiConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "openAiApiKeyEncrypted" TEXT,
    "openAiModel" TEXT,
    "openAiBaseUrl" TEXT,
    "chatModels" TEXT,
    "googleAiApiKeyEncrypted" TEXT,
    "googleAiModel" TEXT,
    "preferredAiProvider" "AiProviderPreference" NOT NULL DEFAULT 'OPENAI',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "SystemAiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "code" "RoleCode" NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "TorDocument" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" "TorStatus" NOT NULL DEFAULT 'UPLOADED',
    "processingError" TEXT,
    "version" INTEGER NOT NULL,
    "year" INTEGER NOT NULL DEFAULT 2569,
    "effectiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TorPage" (
    "id" UUID NOT NULL,
    "torDocumentId" UUID NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "extractedText" TEXT NOT NULL,
    "extractionMethod" "ExtractionMethod" NOT NULL,
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "TorPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TorTopic" (
    "id" UUID NOT NULL,
    "torDocumentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" "TorCategory" NOT NULL,
    "kind" "TorTopicKind" NOT NULL DEFAULT 'TOPIC',
    "sectionLabel" TEXT,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "hoursPerWeek" DECIMAL(6,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "matchable" BOOLEAN NOT NULL DEFAULT true,
    "parentId" UUID,
    "sourcePage" INTEGER,
    "status" "TopicStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TorTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT,
    "aiModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDraft" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "torTopicId" UUID,
    "workTitle" TEXT,
    "category" "TorCategory",
    "description" TEXT,
    "relatedUnit" TEXT,
    "location" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "totalHours" DECIMAL(6,2),
    "result" TEXT,
    "missingFieldsJson" JSONB,
    "confirmedFieldsJson" JSONB,
    "aiConfidence" DOUBLE PRECISION,
    "status" "WorkDraftStatus" NOT NULL DEFAULT 'COLLECTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JaRecord" (
    "id" UUID NOT NULL,
    "runningNumber" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "torDocumentId" UUID,
    "torTopicId" UUID,
    "sourceConversationId" UUID,
    "workTitle" TEXT NOT NULL,
    "category" "TorCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "relatedUnit" TEXT,
    "location" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "totalHours" DECIMAL(6,2),
    "result" TEXT NOT NULL,
    "status" "JaStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JaRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JaRecordVersion" (
    "id" UUID NOT NULL,
    "jaRecordId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "changedBy" UUID NOT NULL,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JaRecordVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" UUID NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "conversationId" UUID,
    "purpose" "AiPurpose" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputTokenCount" INTEGER,
    "outputTokenCount" INTEGER,
    "latencyMs" INTEGER,
    "status" "AiRunStatus" NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Unit_parentId_idx" ON "Unit"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_cmuAccount_key" ON "User"("cmuAccount");

-- CreateIndex
CREATE UNIQUE INDEX "User_entraOid_key" ON "User"("entraOid");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_unitId_idx" ON "User"("unitId");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "TorDocument_storageKey_key" ON "TorDocument"("storageKey");

-- CreateIndex
CREATE INDEX "TorDocument_userId_status_idx" ON "TorDocument"("userId", "status");

-- CreateIndex
CREATE INDEX "TorDocument_userId_year_idx" ON "TorDocument"("userId", "year");

-- CreateIndex
CREATE INDEX "TorDocument_fileHash_idx" ON "TorDocument"("fileHash");

-- CreateIndex
CREATE INDEX "TorDocument_createdAt_idx" ON "TorDocument"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TorDocument_userId_version_key" ON "TorDocument"("userId", "version");

-- CreateIndex
CREATE INDEX "TorPage_torDocumentId_idx" ON "TorPage"("torDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "TorPage_torDocumentId_pageNumber_key" ON "TorPage"("torDocumentId", "pageNumber");

-- CreateIndex
CREATE INDEX "TorTopic_userId_status_idx" ON "TorTopic"("userId", "status");

-- CreateIndex
CREATE INDEX "TorTopic_torDocumentId_category_idx" ON "TorTopic"("torDocumentId", "category");

-- CreateIndex
CREATE INDEX "TorTopic_torDocumentId_sortOrder_idx" ON "TorTopic"("torDocumentId", "sortOrder");

-- CreateIndex
CREATE INDEX "TorTopic_parentId_idx" ON "TorTopic"("parentId");

-- CreateIndex
CREATE INDEX "TorTopic_torDocumentId_matchable_idx" ON "TorTopic"("torDocumentId", "matchable");

-- CreateIndex
CREATE INDEX "Conversation_userId_status_idx" ON "Conversation"("userId", "status");

-- CreateIndex
CREATE INDEX "Conversation_createdAt_idx" ON "Conversation"("createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkDraft_conversationId_key" ON "WorkDraft"("conversationId");

-- CreateIndex
CREATE INDEX "WorkDraft_userId_status_idx" ON "WorkDraft"("userId", "status");

-- CreateIndex
CREATE INDEX "WorkDraft_torTopicId_idx" ON "WorkDraft"("torTopicId");

-- CreateIndex
CREATE UNIQUE INDEX "JaRecord_runningNumber_key" ON "JaRecord"("runningNumber");

-- CreateIndex
CREATE INDEX "JaRecord_userId_status_idx" ON "JaRecord"("userId", "status");

-- CreateIndex
CREATE INDEX "JaRecord_userId_category_idx" ON "JaRecord"("userId", "category");

-- CreateIndex
CREATE INDEX "JaRecord_userId_startAt_idx" ON "JaRecord"("userId", "startAt");

-- CreateIndex
CREATE INDEX "JaRecord_createdAt_idx" ON "JaRecord"("createdAt");

-- CreateIndex
CREATE INDEX "JaRecordVersion_jaRecordId_idx" ON "JaRecordVersion"("jaRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "JaRecordVersion_jaRecordId_version_key" ON "JaRecordVersion"("jaRecordId", "version");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_objectType_objectId_idx" ON "AuditLog"("objectType", "objectId");

-- CreateIndex
CREATE INDEX "AiRun_userId_createdAt_idx" ON "AiRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_conversationId_idx" ON "AiRun"("conversationId");

-- CreateIndex
CREATE INDEX "AiRun_status_idx" ON "AiRun"("status");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TorDocument" ADD CONSTRAINT "TorDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TorPage" ADD CONSTRAINT "TorPage_torDocumentId_fkey" FOREIGN KEY ("torDocumentId") REFERENCES "TorDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TorTopic" ADD CONSTRAINT "TorTopic_torDocumentId_fkey" FOREIGN KEY ("torDocumentId") REFERENCES "TorDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TorTopic" ADD CONSTRAINT "TorTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TorTopic" ADD CONSTRAINT "TorTopic_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TorTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDraft" ADD CONSTRAINT "WorkDraft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDraft" ADD CONSTRAINT "WorkDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDraft" ADD CONSTRAINT "WorkDraft_torTopicId_fkey" FOREIGN KEY ("torTopicId") REFERENCES "TorTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JaRecord" ADD CONSTRAINT "JaRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JaRecord" ADD CONSTRAINT "JaRecord_torDocumentId_fkey" FOREIGN KEY ("torDocumentId") REFERENCES "TorDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JaRecord" ADD CONSTRAINT "JaRecord_torTopicId_fkey" FOREIGN KEY ("torTopicId") REFERENCES "TorTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JaRecord" ADD CONSTRAINT "JaRecord_sourceConversationId_fkey" FOREIGN KEY ("sourceConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JaRecordVersion" ADD CONSTRAINT "JaRecordVersion_jaRecordId_fkey" FOREIGN KEY ("jaRecordId") REFERENCES "JaRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

