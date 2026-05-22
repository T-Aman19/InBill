ALTER TABLE "outlets" ADD COLUMN "setup_code" text;
UPDATE "outlets" SET "setup_code" = UPPER(SUBSTRING(MD5(RANDOM()::TEXT || id::TEXT), 1, 6));
ALTER TABLE "outlets" ALTER COLUMN "setup_code" SET NOT NULL;
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_setup_code_unique" UNIQUE("setup_code");
