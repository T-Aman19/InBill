ALTER TABLE "outlets" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
