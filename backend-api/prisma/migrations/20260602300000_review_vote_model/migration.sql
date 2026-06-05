-- Migration: review_vote_model
-- Adds ReviewVote table for per-user deduplication of review helpful/not-helpful votes.
-- BC-USER-CODE-AUDIT finding: duplicate vote prevention in reviews.service.ts was
-- silently non-functional because the model did not exist in the schema.

CREATE TABLE "ReviewVote" (
  "id"        TEXT        NOT NULL,
  "reviewId"  TEXT        NOT NULL,
  "userId"    TEXT        NOT NULL,
  "helpful"   BOOLEAN     NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReviewVote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReviewVote_reviewId_userId_key" UNIQUE ("reviewId", "userId"),
  CONSTRAINT "ReviewVote_reviewId_fkey" FOREIGN KEY ("reviewId")
    REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReviewVote_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ReviewVote_reviewId_idx" ON "ReviewVote"("reviewId");
