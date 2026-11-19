-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "googleSub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "picture" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waypoint" (
    "userId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "createdAt" DOUBLE PRECISION NOT NULL,
    "updatedAt" DOUBLE PRECISION NOT NULL,
    "deletedAt" DOUBLE PRECISION,
    "serverVersion" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "recordedAt" DOUBLE PRECISION NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "speedKn" DOUBLE PRECISION NOT NULL,
    "bearing" DOUBLE PRECISION NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL,

    CONSTRAINT "Waypoint_pkey" PRIMARY KEY ("userId","id")
);

-- CreateTable
CREATE TABLE "ImportedLayer" (
    "userId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "createdAt" DOUBLE PRECISION NOT NULL,
    "updatedAt" DOUBLE PRECISION NOT NULL,
    "deletedAt" DOUBLE PRECISION,
    "serverVersion" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL,
    "importedAt" DOUBLE PRECISION NOT NULL,
    "hiddenFeatures" JSONB NOT NULL,
    "showDescriptions" BOOLEAN NOT NULL,
    "content" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,

    CONSTRAINT "ImportedLayer_pkey" PRIMARY KEY ("userId","id")
);

-- CreateTable
CREATE TABLE "Track" (
    "userId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "createdAt" DOUBLE PRECISION NOT NULL,
    "updatedAt" DOUBLE PRECISION NOT NULL,
    "deletedAt" DOUBLE PRECISION,
    "serverVersion" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startedAt" DOUBLE PRECISION NOT NULL,
    "endedAt" DOUBLE PRECISION,
    "distanceNm" DOUBLE PRECISION NOT NULL,
    "pointCount" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("userId","id")
);

-- CreateTable
CREATE TABLE "TrackPoint" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "t" DOUBLE PRECISION NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "speedKn" DOUBLE PRECISION,
    "courseDeg" DOUBLE PRECISION,

    CONSTRAINT "TrackPoint_pkey" PRIMARY KEY ("userId","trackId","seq")
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" DOUBLE PRECISION NOT NULL,
    "serverVersion" INTEGER NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("userId","key")
);

-- CreateTable
CREATE TABLE "ActiveRoute" (
    "userId" TEXT NOT NULL,
    "updatedAt" DOUBLE PRECISION NOT NULL,
    "serverVersion" INTEGER NOT NULL,
    "points" JSONB NOT NULL,

    CONSTRAINT "ActiveRoute_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_familyId_idx" ON "Session"("familyId");

-- CreateIndex
CREATE INDEX "Waypoint_userId_serverVersion_idx" ON "Waypoint"("userId", "serverVersion");

-- CreateIndex
CREATE INDEX "ImportedLayer_userId_serverVersion_idx" ON "ImportedLayer"("userId", "serverVersion");

-- CreateIndex
CREATE INDEX "Track_userId_serverVersion_idx" ON "Track"("userId", "serverVersion");

-- CreateIndex
CREATE INDEX "UserSetting_userId_serverVersion_idx" ON "UserSetting"("userId", "serverVersion");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waypoint" ADD CONSTRAINT "Waypoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedLayer" ADD CONSTRAINT "ImportedLayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackPoint" ADD CONSTRAINT "TrackPoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveRoute" ADD CONSTRAINT "ActiveRoute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
