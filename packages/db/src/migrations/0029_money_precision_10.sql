ALTER TABLE "wallets" ALTER COLUMN "current_balance" TYPE numeric(30, 10);
--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "balance_purchased" TYPE numeric(30, 10);
--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "balance_bonus" TYPE numeric(30, 10);
--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "balance_promo" TYPE numeric(30, 10);
--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "balance_earned" TYPE numeric(30, 10);
--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "playthrough_required" TYPE numeric(30, 10);
--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "playthrough_progress" TYPE numeric(30, 10);
