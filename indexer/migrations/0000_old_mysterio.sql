CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" numeric NOT NULL,
	"settings_id" integer NOT NULL,
	"range_min" integer NOT NULL,
	"range_max" integer NOT NULL,
	"max_attempts" integer NOT NULL,
	"status" text DEFAULT 'playing' NOT NULL,
	"guess_count" integer DEFAULT 0 NOT NULL,
	"score" bigint,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp NOT NULL,
	"transaction_hash" text NOT NULL,
	"last_updated_block" bigint NOT NULL,
	"last_updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "game_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"total_sessions" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"avg_guesses" numeric,
	"perfect_games" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" numeric NOT NULL,
	"guess_value" integer NOT NULL,
	"result" text NOT NULL,
	"guess_number" integer NOT NULL,
	"range_min_after" integer NOT NULL,
	"range_max_after" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp NOT NULL,
	"transaction_hash" text NOT NULL,
	"event_index" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "game_sessions_token_idx" ON "game_sessions" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "game_sessions_status_idx" ON "game_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "game_sessions_settings_idx" ON "game_sessions" USING btree ("settings_id");--> statement-breakpoint
CREATE INDEX "game_sessions_token_status_idx" ON "game_sessions" USING btree ("token_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "game_sessions_token_block_tx_idx" ON "game_sessions" USING btree ("token_id","block_number","transaction_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "guesses_block_tx_event_idx" ON "guesses" USING btree ("block_number","transaction_hash","event_index");--> statement-breakpoint
CREATE INDEX "guesses_token_idx" ON "guesses" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "guesses_token_guess_num_idx" ON "guesses" USING btree ("token_id","guess_number");